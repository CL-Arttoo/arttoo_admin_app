import { useCallback, useEffect, useState } from 'react';
import './App.css';
import { ConnectButton, useCurrentAccount, useSignAndExecuteTransaction } from "@mysten/dapp-kit";
import "@mysten/dapp-kit/dist/index.css";
import { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';

// mainnet
const rpc_url = "https://fullnode.mainnet.sui.io:443";
const PACKAGE_ID = "0x9d11135054b1ab5f53653b88fb83979255417e6c6049ac91535b78c0d4803976";
const OFFERING_OBJECT_ID = "0xe24160d0aa7ca299cf608144b0abe109b8ca5c0a612e38c9a1aec18a1130c451";
const REGISTRY_OBJECT_ID = "0x26407ed0fa0324604960fb38d747a8c2e36dedefb55918949d5c27ec502c650e";
const VAULT_OBJECT_ID = "0x8e6be131f12236f4340e96c97ac0e2466b8cfe32e7dbc486d888bbd1dc4a70b1";
const COIN_TYPE = "0x1e55cc88c0cefbaab52a129dabb79097f563391f015bef682bac46247f3fa2e4::loj::LOJ";
const SUI_CLOCK_OBJECT_ID = "0x6";

// testnet
// const rpc_url = "https://fullnode.testnet.sui.io:443";
// const PACKAGE_ID = "0xff0839064b38e03c1f873a667403e99e7e7fd2e905340d3f283b5e6ac06d293b";
// const OFFERING_OBJECT_ID = "0xbdedd42c7d14f41d408e444d46cba3ba5c8578c56b72a6c8c03521bb27f9544f";
// const REGISTRY_OBJECT_ID = "0x5e7d8a64811de9e676cb29e759757096daad6dfcf93bc5584cbe6f21a020c9be";
// const VAULT_OBJECT_ID = "0x3e5e21d08644b85b686ca076c0bd9fc4f62721a12ddb5a519bfc7dc433af0e6b";
// const COIN_TYPE = "0x63ffab44beea2cb7b1c0a97bd02a0103dfdc2e9e421ffb42dbde8a69ffcdda32::coin_template::COIN_TEMPLATE";
// const SUI_CLOCK_OBJECT_ID = "0x6";

// Offering status constants
const OFFERING_STATE_DRAFT = 200;
const OFFERING_STATE_ACTIVE = 201;
const OFFERING_STATE_COMPLETED = 202;
const OFFERING_STATE_CANCELLED = 203;

// Round constants (assuming these match the smart contract)
const ROUND_PRESALE = 100;
const ROUND_TRADING = 101;
const ROUND_REDEEM = 102;

// It's generally better to use a client from a provider, but for this simple query a new client is fine.
const suiClient = new SuiClient({ url: rpc_url });

function App() {
  const account = useCurrentAccount();
  const { mutate: signAndExecute } = useSignAndExecuteTransaction();
  const [balance, setBalance] = useState<string | null>(null);
  const [offeringEndTime, setOfferingEndTime] = useState<string | null>(null);
  const [offeringEndTimeMs, setOfferingEndTimeMs] = useState<number>(0);
  const [newEndTime, setNewEndTime] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);

  // Proceeds withdrawal state
  const [receivingAddress, setReceivingAddress] = useState('');
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);

  // Trading activation state
  const [isActivatingTrading, setIsActivatingTrading] = useState(false);
  const [activationError, setActivationError] = useState<string | null>(null);
  const [isEndingOffering, setIsEndingOffering] = useState(false);
  const [endError, setEndError] = useState<string | null>(null);

  // Offering status state
  const [offeringStatus, setOfferingStatus] = useState<number | null>(null);

  // Artwork vault state
  const [currentRound, setCurrentRound] = useState<number | null>(null);
  const [activeOfferingId, setActiveOfferingId] = useState<string | null>(null);

  // Copy feedback state
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  // Function to copy offering ID to clipboard
  const copyOfferingId = async () => {
    if (!activeOfferingId) return;
    
    try {
      await navigator.clipboard.writeText(activeOfferingId);
      setCopyFeedback('Copied!');
      setTimeout(() => setCopyFeedback(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
      setCopyFeedback('Failed to copy');
      setTimeout(() => setCopyFeedback(null), 2000);
    }
  };

  // Helper function to get status name
  const getStatusName = (status: number | null) => {
    if (status === null) return 'Loading...';
    switch (status) {
      case OFFERING_STATE_DRAFT: return 'Draft';
      case OFFERING_STATE_ACTIVE: return 'Active';
      case OFFERING_STATE_COMPLETED: return 'Completed';
      case OFFERING_STATE_CANCELLED: return 'Cancelled';
      default: return `Unknown (${status})`;
    }
  };

  // Helper function to get status color
  const getStatusColor = (status: number | null) => {
    if (status === null) return '#6c757d';
    switch (status) {
      case OFFERING_STATE_DRAFT: return '#6c757d';
      case OFFERING_STATE_ACTIVE: return '#28a745';
      case OFFERING_STATE_COMPLETED: return '#007bff';
      case OFFERING_STATE_CANCELLED: return '#dc3545';
      default: return '#6c757d';
    }
  };

  // Helper function to get round name
  const getRoundName = (round: number | null) => {
    if (round === null) return 'Loading...';
    switch (round) {
      case ROUND_PRESALE: return 'Presale';
      case ROUND_TRADING: return 'Trading';
      case ROUND_REDEEM: return 'Redeem';
      default: return `Unknown (${round})`;
    }
  };

  // Helper function to get round color
  const getRoundColor = (round: number | null) => {
    if (round === null) return '#6c757d';
    switch (round) {
      case ROUND_PRESALE: return '#ffc107';
      case ROUND_TRADING: return '#28a745';
      case ROUND_REDEEM: return '#007bff';
      default: return '#6c757d';
    }
  };

  // Presale information state
  const [presaleData, setPresaleData] = useState<{
    tokenAllocation: number;
    tokensSold: number;
    availableTokens: number;
    totalProceeds: number;
  } | null>(null);

  const fetchOfferingEndTime = useCallback(() => {
    if (!account) return;
    const tx = new Transaction();
    tx.moveCall({
      target: `${PACKAGE_ID}::offering::end_time`,
      arguments: [tx.object(OFFERING_OBJECT_ID)],
    });
    suiClient.devInspectTransactionBlock({
      sender: account!.address,
      transactionBlock: tx,
    }).then(res => {
      console.log("Offering end time fetch result:", res);
      if (res.results && res.results[0]?.returnValues?.[0]) {
        const rawEndTime = res.results[0].returnValues[0][0];
        const view = new DataView(new Uint8Array(rawEndTime).buffer);
        const endTimeBigInt = view.getBigUint64(0, true);
        const endTimeMs = Number(endTimeBigInt);
        const date = new Date(endTimeMs);
        const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const endTime = `${date.toLocaleString()} (${userTimezone})`;
        setOfferingEndTime(endTime);
        setOfferingEndTimeMs(endTimeMs);
      }
    }).catch(err => {
      console.error("Error fetching offering end time:", err);
      setOfferingEndTime("Error fetching end time.");
    });
  }, [account]);

  const fetchPresaleData = useCallback(() => {
    if (!account) return;
    
    // Create transaction to fetch multiple offering data points
    const tx = new Transaction();
    
    // Fetch token allocation
    tx.moveCall({
      target: `${PACKAGE_ID}::offering::token_allocation`,
      arguments: [tx.object(OFFERING_OBJECT_ID)],
    });
    
    // Fetch tokens sold
    tx.moveCall({
      target: `${PACKAGE_ID}::offering::tokens_sold`,
      arguments: [tx.object(OFFERING_OBJECT_ID)],
    });
    
    // Fetch available tokens
    tx.moveCall({
      target: `${PACKAGE_ID}::offering::available_tokens`,
      arguments: [tx.object(OFFERING_OBJECT_ID)],
    });
    
    // Fetch total proceeds
    tx.moveCall({
      target: `${PACKAGE_ID}::offering::total_proceeds`,
      arguments: [tx.object(OFFERING_OBJECT_ID)],
    });

    suiClient.devInspectTransactionBlock({
      sender: account!.address,
      transactionBlock: tx,
    }).then(res => {
      console.log("Presale data fetch result:", res);
      if (res.results && res.results.length >= 4) {
        try {
          // Parse token allocation (command 0)
          const tokenAllocationRaw = res.results[0]?.returnValues?.[0]?.[0];
          if (!tokenAllocationRaw) throw new Error("Missing token allocation data");
          const tokenAllocationView = new DataView(new Uint8Array(tokenAllocationRaw).buffer);
          const tokenAllocation = Number(tokenAllocationView.getBigUint64(0, true)) / 1_000_000; // Convert from 6 decimals
          
          // Parse tokens sold (command 1)
          const tokensSoldRaw = res.results[1]?.returnValues?.[0]?.[0];
          if (!tokensSoldRaw) throw new Error("Missing tokens sold data");
          const tokensSoldView = new DataView(new Uint8Array(tokensSoldRaw).buffer);
          const tokensSold = Number(tokensSoldView.getBigUint64(0, true)) / 1_000_000; // Convert from 6 decimals
          
          // Parse available tokens (command 2)
          const availableTokensRaw = res.results[2]?.returnValues?.[0]?.[0];
          if (!availableTokensRaw) throw new Error("Missing available tokens data");
          const availableTokensView = new DataView(new Uint8Array(availableTokensRaw).buffer);
          const availableTokens = Number(availableTokensView.getBigUint64(0, true)) / 1_000_000; // Convert from 6 decimals
          
          // Parse total proceeds (command 3)
          const totalProceedsRaw = res.results[3]?.returnValues?.[0]?.[0];
          if (!totalProceedsRaw) throw new Error("Missing total proceeds data");
          const totalProceedsView = new DataView(new Uint8Array(totalProceedsRaw).buffer);
          const totalProceeds = Number(totalProceedsView.getBigUint64(0, true)) / 1_000_000; // Convert from 6 decimals (USDC)
          
          setPresaleData({
            tokenAllocation,
            tokensSold,
            availableTokens,
            totalProceeds
          });
        } catch (error) {
          console.error("Error parsing presale data:", error);
          setPresaleData(null);
        }
      }
    }).catch(err => {
      console.error("Error fetching presale data:", err);
      setPresaleData(null);
    });
  }, [account]);

  const fetchOfferingStatus = useCallback(() => {
    if (!account) return;
    const tx = new Transaction();
    tx.moveCall({
      target: `${PACKAGE_ID}::offering::status`,
      arguments: [tx.object(OFFERING_OBJECT_ID)],
    });
    suiClient.devInspectTransactionBlock({
      sender: account!.address,
      transactionBlock: tx,
    }).then(res => {
      console.log("Offering status fetch result:", res);
      if (res.results && res.results[0]?.returnValues?.[0]) {
        const statusRaw = res.results[0].returnValues[0][0];
        const statusView = new DataView(new Uint8Array(statusRaw).buffer);
        const status = statusView.getUint8(0);
        setOfferingStatus(status);
      }
    }).catch(err => {
      console.error("Error fetching offering status:", err);
      setOfferingStatus(null);
    });
  }, [account]);

  const fetchArtworkVaultInfo = useCallback(() => {
    if (!account) return;
    const tx = new Transaction();
    
    // Fetch current round
    tx.moveCall({
      target: `${PACKAGE_ID}::artwork::current_round`,
      arguments: [tx.object(VAULT_OBJECT_ID)],
      typeArguments: [COIN_TYPE],
    });
    
    // Fetch current offering
    tx.moveCall({
      target: `${PACKAGE_ID}::artwork::current_offering`,
      arguments: [tx.object(VAULT_OBJECT_ID)],
      typeArguments: [COIN_TYPE],
    });
    
    suiClient.devInspectTransactionBlock({
      sender: account!.address,
      transactionBlock: tx,
    }).then(res => {
      console.log("Artwork vault info fetch result:", res);
      if (res.results && res.results.length >= 2) {
        try {
          // Parse current round (command 0)
          const roundRaw = res.results[0]?.returnValues?.[0]?.[0];
          if (roundRaw) {
            const roundView = new DataView(new Uint8Array(roundRaw).buffer);
            const round = roundView.getUint8(0);
            setCurrentRound(round);
          }
          
          // Parse current offering (command 1) - this returns Option<ID>
          const offeringRaw = res.results[1]?.returnValues?.[0]?.[0];
          if (offeringRaw) {
            // For Option<ID>, we need to check if it's Some or None
            // The first byte indicates if it's Some (1) or None (0)
            const offeringView = new DataView(new Uint8Array(offeringRaw).buffer);
            const isSome = offeringView.getUint8(0);
            if (isSome === 1) {
              // Extract the ID (next 32 bytes)
              const idBytes = new Uint8Array(offeringRaw).slice(1, 33);
              const idHex = '0x' + Array.from(idBytes).map(b => b.toString(16).padStart(2, '0')).join('');
              setActiveOfferingId(idHex);
            } else {
              setActiveOfferingId(null);
            }
          }
        } catch (error) {
          console.error("Error parsing artwork vault info:", error);
          setCurrentRound(null);
          setActiveOfferingId(null);
        }
      }
    }).catch(err => {
      console.error("Error fetching artwork vault info:", err);
      setCurrentRound(null);
      setActiveOfferingId(null);
    });
  }, [account]);

  useEffect(() => {
    if (account) {
      // Fetch balance
      suiClient.getBalance({ owner: account.address }).then(balanceRes => {
        setBalance(String(Number(balanceRes.totalBalance) / 10 ** 9));
      });

      fetchOfferingEndTime();
      fetchPresaleData(); // Fetch presale data on mount
      fetchOfferingStatus(); // Fetch offering status on mount
      fetchArtworkVaultInfo(); // Fetch artwork vault info on mount
    }
  }, [account, fetchOfferingEndTime, fetchPresaleData, fetchOfferingStatus, fetchArtworkVaultInfo]);

  const handleUpdateEndTime = () => {
    if (!newEndTime) {
      setUpdateError("Please select a new end time.");
      return;
    }
    const newEndTimeMs = new Date(newEndTime).getTime();
    if (newEndTimeMs <= offeringEndTimeMs) {
      setUpdateError("New end time must be later than the current end time.");
      return;
    }
    if (!account) {
        setUpdateError("Cannot update time: wallet not connected.");
        return;
    }

    setUpdateError(null);
    setIsUpdating(true);

    const tx = new Transaction();
    const proof = tx.moveCall({
        target: `${PACKAGE_ID}::arttoo::admin_proof`,
        arguments: [tx.object(REGISTRY_OBJECT_ID)],
    });

    const offering = tx.moveCall({
      target: `${PACKAGE_ID}::artwork::receive_offering`,
      arguments: [
        tx.object(VAULT_OBJECT_ID), 
        proof,
        tx.object(OFFERING_OBJECT_ID) 
      ],
      typeArguments: [COIN_TYPE]
    });

    console.log("newEndTimeMs:", newEndTimeMs);

    tx.moveCall({
      target: `${PACKAGE_ID}::offering::update_end_time`,
      arguments: [
        offering,
        proof,
        tx.pure.u64(newEndTimeMs) // ✅ Use tx.pure.u64() instead of bcs serialization
      ],
    });

    tx.transferObjects([offering], tx.pure.address(VAULT_OBJECT_ID));

    tx.setGasBudget(500_000_000);

    signAndExecute(
      {
        transaction: tx,
      },
      {
        onSuccess: (result) => {
          console.log("Update successful:", result);
          setIsUpdating(false);
          fetchOfferingEndTime(); // Refresh the end time
          fetchPresaleData(); // Refresh presale data
        },
        onError: (error) => {
          console.error("Update failed:", error);
          setUpdateError("Failed to update end time. See console for details.");
          setIsUpdating(false);
        },
      }
    );
  };

  const handleWithdrawProceeds = () => {
    if (!receivingAddress) {
      setWithdrawError("Please enter a receiving address.");
      return;
    }
    if (!account) {
      setWithdrawError("Cannot withdraw: wallet not connected.");
      return;
    }
    if (!presaleData || presaleData.totalProceeds <= 0) {
      setWithdrawError("No proceeds available to withdraw.");
      return;
    }

    setWithdrawError(null);
    setIsWithdrawing(true);

    const tx = new Transaction();
    
    // Get both admin and super admin proofs
    const adminProof = tx.moveCall({
      target: `${PACKAGE_ID}::arttoo::admin_proof`,
      arguments: [tx.object(REGISTRY_OBJECT_ID)],
    });

    const superAdminProof = tx.moveCall({
      target: `${PACKAGE_ID}::arttoo::super_admin_proof`,
      arguments: [tx.object(REGISTRY_OBJECT_ID)],
    });

    // Receive the offering from the artwork vault
    const receivedOffering = tx.moveCall({
      target: `${PACKAGE_ID}::artwork::receive_offering`,
      arguments: [
        tx.object(VAULT_OBJECT_ID),
        adminProof,
        tx.object(OFFERING_OBJECT_ID),
      ],
      typeArguments: [COIN_TYPE],
    });

    // Withdraw the proceeds from the offering
    const proceeds = tx.moveCall({
      target: `${PACKAGE_ID}::offering::withdraw_proceeds`,
      arguments: [
        receivedOffering,
        superAdminProof,
      ],
    });

    // Transfer the proceeds to the receiving address
    tx.transferObjects([proceeds], tx.pure.address(receivingAddress));

    // Return the offering to the artwork vault
    tx.transferObjects([receivedOffering], tx.pure.address(VAULT_OBJECT_ID));

    tx.setGasBudget(500_000_000);

    signAndExecute(
      {
        transaction: tx,
      },
      {
        onSuccess: (result) => {
          console.log("Withdrawal successful:", result);
          setIsWithdrawing(false);
          setReceivingAddress(''); // Clear the input
          fetchPresaleData(); // Refresh presale data
          fetchArtworkVaultInfo(); // Refresh artwork vault info
        },
        onError: (error) => {
          console.error("Withdrawal failed:", error);
          setWithdrawError("Failed to withdraw proceeds. See console for details.");
          setIsWithdrawing(false);
        },
      }
    );
  };

  const handleActivateTrading = () => {
    if (!account) {
      setActivationError("Cannot activate trading: wallet not connected.");
      return;
    }

    // Check if offering is active
    if (offeringStatus !== OFFERING_STATE_ACTIVE) {
      setActivationError("Trading cannot be activated: offering must be in active status.");
      return;
    }

    // Check activation criteria
    const currentTime = Date.now();
    const isTimeElapsed = currentTime > offeringEndTimeMs;
    const isFullySold = presaleData && presaleData.availableTokens === 0;

    if (!isTimeElapsed && !isFullySold) {
      setActivationError("Trading cannot be activated yet. Presale must end or all tokens must be sold.");
      return;
    }

    setActivationError(null);
    setIsActivatingTrading(true);

    const tx = new Transaction();
    
    // Get the Admin proof
    const adminProof = tx.moveCall({
      target: `${PACKAGE_ID}::arttoo::admin_proof`,
      arguments: [tx.object(REGISTRY_OBJECT_ID)],
    });
    // Activate the trading round
    tx.moveCall({
      target: `${PACKAGE_ID}::artwork::activate_trading_round`,
      arguments: [
        tx.object(VAULT_OBJECT_ID),
        adminProof,
        tx.object(SUI_CLOCK_OBJECT_ID),
        tx.object(OFFERING_OBJECT_ID),
      ],
      typeArguments: [COIN_TYPE],
    });

    tx.setGasBudget(500_000_000);

    signAndExecute(
      {
        transaction: tx,
      },
      {
        onSuccess: (result) => {
          console.log("Trading activation successful:", result);
          setIsActivatingTrading(false);
          fetchOfferingEndTime(); // Refresh data
          fetchPresaleData(); // Refresh presale data
          fetchOfferingStatus(); // Refresh offering status
          fetchArtworkVaultInfo(); // Refresh artwork vault info
        },
        onError: (error) => {
          console.error("Trading activation failed:", error);
          setActivationError("Failed to activate trading. See console for details.");
          setIsActivatingTrading(false);
        },
      }
    );
  };

  const handleEndOffering = () => {
    if (!account) {
      setEndError("Cannot end offering: wallet not connected.");
      return;
    }

    if (offeringStatus !== OFFERING_STATE_ACTIVE) {
      setEndError("Offering must be active to end.");
      return;
    }

    const currentTime = Date.now();
    const isTimeElapsed = currentTime > offeringEndTimeMs;
    const isFullySold = presaleData && presaleData.availableTokens === 0;
    if (!isTimeElapsed && !isFullySold) {
      setEndError("Cannot end yet. Presale must end or all tokens must be sold.");
      return;
    }

    setEndError(null);
    setIsEndingOffering(true);

    const tx = new Transaction();

    const adminProof = tx.moveCall({
      target: `${PACKAGE_ID}::arttoo::admin_proof`,
      arguments: [tx.object(REGISTRY_OBJECT_ID)],
    });

    const receivedOffering = tx.moveCall({
      target: `${PACKAGE_ID}::artwork::receive_offering`,
      arguments: [tx.object(VAULT_OBJECT_ID), adminProof, tx.object(OFFERING_OBJECT_ID)],
      typeArguments: [COIN_TYPE],
    });

    tx.moveCall({
      target: `${PACKAGE_ID}::offering::end`,
      arguments: [
        receivedOffering,
        adminProof,
        tx.object(SUI_CLOCK_OBJECT_ID),
      ],
    });

    tx.transferObjects([receivedOffering], tx.pure.address(VAULT_OBJECT_ID));

    tx.setGasBudget(500_000_000);

    signAndExecute(
      {
        transaction: tx,
      },
      {
        onSuccess: (result) => {
          console.log("End offering successful:", result);
          setIsEndingOffering(false);
          fetchOfferingEndTime();
          fetchPresaleData();
          fetchOfferingStatus();
          fetchArtworkVaultInfo();
        },
        onError: (error) => {
          console.error("End offering failed:", error);
          setEndError("Failed to end offering. See console for details.");
          setIsEndingOffering(false);
        },
      }
    );
  };

  return (
    <div style={{
      minHeight: "100vh",
      backgroundColor: "#f5f5f5",
      fontFamily: "system-ui, -apple-system, sans-serif"
    }}>
      {/* Header */}
      <header style={{
        backgroundColor: "#1a1a1a",
        color: "white",
        padding: "1rem 2rem",
        boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
      }}>
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          maxWidth: "1200px",
          margin: "0 auto"
        }}>
          <h1 style={{margin: 0, fontSize: "1.5rem", fontWeight: "600"}}>
            🎨 ARTTOO Admin Dashboard
          </h1>
          <ConnectButton />
        </div>
      </header>

      {/* Main Content */}
      <main style={{
        maxWidth: "1200px",
        margin: "0 auto",
        padding: "2rem",
        display: "grid",
        gap: "2rem",
        gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))"
      }}>
        {account ? (
          <>
            {/* Account Info Card */}
            <div style={{
              backgroundColor: "white",
              borderRadius: "12px",
              padding: "1.5rem",
              boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
              border: "1px solid #e0e0e0"
            }}>
              <h2 style={{
                margin: "0 0 1rem 0",
                color: "#1a1a1a",
                fontSize: "1.25rem",
                fontWeight: "600"
              }}>
                💳 Account Information
              </h2>
              <div style={{fontSize: "0.9rem", color: "#666", lineHeight: "1.6"}}>
                <p><strong>Address:</strong> <br/><span style={{
                  fontFamily: "monospace",
                  backgroundColor: "#f8f9fa",
                  padding: "4px 8px",
                  borderRadius: "4px",
                  fontSize: "0.8rem",
                  wordBreak: "break-all",
                  display: "inline-block",
                  maxWidth: "100%"
                }}>{account.address}</span></p>
                <p><strong>SUI Balance:</strong> <span style={{color: "#0066cc", fontWeight: "500"}}>{balance ?? 'Loading...'} SUI</span></p>
              </div>
            </div>

            {/* Offering Details Card */}
            <div style={{
              backgroundColor: "white",
              borderRadius: "12px",
              padding: "1.5rem",
              boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
              border: "1px solid #e0e0e0"
            }}>
              <h2 style={{
                margin: "0 0 1rem 0",
                color: "#1a1a1a",
                fontSize: "1.25rem",
                fontWeight: "600"
              }}>
                ⏰ Offering Status
              </h2>
              <div style={{fontSize: "0.9rem", color: "#666", lineHeight: "1.6"}}>
                <p><strong>End Time:</strong> <span style={{color: "#dc3545", fontWeight: "500"}}>{offeringEndTime ?? 'Loading...'}</span></p>
                <p><strong>Status:</strong> <span style={{color: getStatusColor(offeringStatus), fontWeight: "500"}}>{getStatusName(offeringStatus)}</span></p>
                <p style={{fontSize: "0.8rem", fontStyle: "italic", color: "#888", margin: "0.5rem 0 0 0"}}>
                  Time displayed in your local timezone
                </p>
              </div>
            </div>

            {/* Artwork Vault Info Card */}
            <div style={{
              backgroundColor: "white",
              borderRadius: "12px",
              padding: "1.5rem",
              boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
              border: "1px solid #e0e0e0"
            }}>
              <h2 style={{
                margin: "0 0 1rem 0",
                color: "#1a1a1a",
                fontSize: "1.25rem",
                fontWeight: "600"
              }}>
                🏛️ Vault Information
              </h2>
              <div style={{fontSize: "0.9rem", color: "#666", lineHeight: "1.6"}}>
                <p><strong>Current Round:</strong> <span style={{color: getRoundColor(currentRound), fontWeight: "500"}}>{getRoundName(currentRound)}</span></p>
                <p><strong>Active Offering:</strong> 
                  {activeOfferingId ? (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}>
                      <span style={{
                        color: "#28a745", 
                        fontWeight: "500",
                        fontFamily: "monospace",
                        fontSize: "0.8rem"
                      }}>
                        {`${activeOfferingId.slice(0, 10)}...${activeOfferingId.slice(-8)}`}
                      </span>
                      <button
                        onClick={copyOfferingId}
                        style={{
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          fontSize: "0.9rem",
                          padding: "2px",
                          color: "#007bff",
                          borderRadius: "3px",
                          display: "inline-flex",
                          alignItems: "center",
                          transition: "background-color 0.15s ease-in-out"
                        }}
                        onMouseOver={(e) => (e.target as HTMLButtonElement).style.backgroundColor = "#f8f9fa"}
                        onMouseOut={(e) => (e.target as HTMLButtonElement).style.backgroundColor = "transparent"}
                        title="Copy full address"
                      >
                        📋
                      </button>
                      {copyFeedback && (
                        <span style={{
                          fontSize: "0.75rem",
                          color: copyFeedback === 'Copied!' ? "#28a745" : "#dc3545",
                          fontWeight: "500"
                        }}>
                          {copyFeedback}
                        </span>
                      )}
                    </span>
                  ) : (
                    <span style={{color: "#6c757d", fontWeight: "500"}}>None</span>
                  )}
                </p>
                <p style={{fontSize: "0.8rem", fontStyle: "italic", color: "#888", margin: "0.5rem 0 0 0"}}>
                  Vault manages offering lifecycle and token distribution
                </p>
              </div>
            </div>

            {/* Presale Progress Card - Full Width */}
            <div style={{
              backgroundColor: "white",
              borderRadius: "12px",
              padding: "1.5rem",
              boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
              border: "1px solid #e0e0e0",
              gridColumn: "1 / -1"
            }}>
              <h2 style={{
                margin: "0 0 1.5rem 0",
                color: "#1a1a1a",
                fontSize: "1.25rem",
                fontWeight: "600"
              }}>
                📊 Presale Progress
              </h2>
              {presaleData ? (
                <>
                  {/* Progress Section */}
                  <div style={{marginBottom: "2rem"}}>
                    <div style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: "0.5rem"
                    }}>
                      <span style={{color: "#333", fontWeight: "500"}}>
                        <strong>Tokens Sold:</strong> {presaleData.tokensSold.toLocaleString()} / {presaleData.tokenAllocation.toLocaleString()}
                      </span>
                      <span style={{
                        color: "#0066cc",
                        fontWeight: "700",
                        fontSize: "1.1rem"
                      }}>
                        {((presaleData.tokensSold / presaleData.tokenAllocation) * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div style={{
                      width: "100%",
                      height: "24px",
                      backgroundColor: "#e9ecef",
                      borderRadius: "12px",
                      overflow: "hidden",
                      border: "1px solid #dee2e6"
                    }}>
                      <div style={{
                        width: `${(presaleData.tokensSold / presaleData.tokenAllocation) * 100}%`,
                        height: "100%",
                        background: "linear-gradient(90deg, #28a745, #20c997)",
                        transition: "width 0.3s ease",
                        borderRadius: "12px"
                      }}></div>
                    </div>
                  </div>
                  
                  {/* Stats Grid */}
                  <div style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                    gap: "1.5rem"
                  }}>
                    <div style={{
                      padding: "1rem",
                      backgroundColor: "#f8f9fa",
                      borderRadius: "8px",
                      border: "1px solid #e9ecef"
                    }}>
                      <div style={{color: "#6c757d", fontSize: "0.8rem", fontWeight: "500", marginBottom: "0.25rem"}}>
                        AVAILABLE TOKENS
                      </div>
                      <div style={{color: "#495057", fontSize: "1.25rem", fontWeight: "700"}}>
                        {presaleData.availableTokens.toLocaleString()}
                      </div>
                    </div>
                    
                    <div style={{
                      padding: "1rem",
                      backgroundColor: "#e8f5e8",
                      borderRadius: "8px",
                      border: "1px solid #c3e6c3"
                    }}>
                      <div style={{color: "#155724", fontSize: "0.8rem", fontWeight: "500", marginBottom: "0.25rem"}}>
                        PROCEEDS in VAULT
                      </div>
                      <div style={{color: "#155724", fontSize: "1.25rem", fontWeight: "700"}}>
                        ${presaleData.totalProceeds.toLocaleString()} USDC
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div style={{
                  textAlign: "center",
                  padding: "2rem",
                  color: "#6c757d"
                }}>
                  <div style={{fontSize: "1.5rem", marginBottom: "0.5rem"}}>⏳</div>
                  <p>Loading presale data...</p>
                </div>
              )}
            </div>

            {/* Update End Time Card - Full Width */}
            <div style={{
              backgroundColor: "white",
              borderRadius: "12px",
              padding: "1.5rem",
              boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
              border: "1px solid #e0e0e0",
              gridColumn: "1 / -1"
            }}>
              <h2 style={{
                margin: "0 0 1.5rem 0",
                color: "#1a1a1a",
                fontSize: "1.25rem",
                fontWeight: "600"
              }}>
                ⚙️ Update Offering End Time
              </h2>
              
              <div style={{
                display: "flex",
                gap: "1rem",
                alignItems: "flex-end",
                flexWrap: "wrap",
                width: "100%"
              }}>
                <div style={{flex: "1", minWidth: "200px", maxWidth: "400px"}}>
                  <label style={{
                    display: "block",
                    marginBottom: "0.5rem",
                    color: "#495057",
                    fontWeight: "500",
                    fontSize: "0.9rem"
                  }}>
                    New End Time
                  </label>
                  <input 
                    type="datetime-local" 
                    value={newEndTime}
                    onChange={(e) => setNewEndTime(e.target.value)}
                    style={{
                      width: "100%",
                      maxWidth: "100%",
                      padding: "0.75rem",
                      border: "2px solid #e9ecef",
                      borderRadius: "8px",
                      fontSize: "0.9rem",
                      outline: "none",
                      transition: "border-color 0.15s ease-in-out",
                      boxSizing: "border-box"
                    }}
                    onFocus={(e) => e.target.style.borderColor = "#0066cc"}
                    onBlur={(e) => e.target.style.borderColor = "#e9ecef"}
                  />
                </div>
                
                <button 
                  onClick={handleUpdateEndTime} 
                  disabled={isUpdating}
                  style={{
                    padding: "0.75rem 1.5rem",
                    backgroundColor: isUpdating ? "#6c757d" : "#0066cc",
                    color: "white",
                    border: "none",
                    borderRadius: "8px",
                    fontSize: "0.9rem",
                    fontWeight: "500",
                    cursor: isUpdating ? "not-allowed" : "pointer",
                    transition: "background-color 0.15s ease-in-out",
                    whiteSpace: "nowrap",
                    minWidth: "140px"
                  }}
                  onMouseOver={(e) => {
                    if (!isUpdating) (e.target as HTMLButtonElement).style.backgroundColor = "#0056b3";
                  }}
                  onMouseOut={(e) => {
                    if (!isUpdating) (e.target as HTMLButtonElement).style.backgroundColor = "#0066cc";
                  }}
                >
                  {isUpdating ? "Updating..." : "Update End Time"}
                </button>
              </div>
              
              {updateError && (
                <div style={{
                  marginTop: "1rem",
                  padding: "0.75rem",
                  backgroundColor: "#f8d7da",
                  border: "1px solid #f5c6cb",
                  borderRadius: "6px",
                  color: "#721c24",
                  fontSize: "0.9rem"
                }}>
                  ❌ {updateError}
                </div>
              )}
            </div>

            {/* Proceeds Management Card - Full Width */}
            <div style={{
              backgroundColor: "white",
              borderRadius: "12px",
              padding: "1.5rem",
              boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
              border: "1px solid #e0e0e0",
              gridColumn: "1 / -1"
            }}>
              <h2 style={{
                margin: "0 0 1.5rem 0",
                color: "#1a1a1a",
                fontSize: "1.25rem",
                fontWeight: "600"
              }}>
                💰 Proceeds Management
              </h2>
              
              {presaleData ? (
                <>
                  {/* Current Proceeds Display */}
                  <div style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                    gap: "1rem",
                    marginBottom: "2rem"
                  }}>
                    <div style={{
                      padding: "1rem",
                      backgroundColor: "#e8f5e8",
                      borderRadius: "8px",
                      border: "1px solid #c3e6c3",
                      textAlign: "center"
                    }}>
                      <div style={{color: "#155724", fontSize: "0.8rem", fontWeight: "500", marginBottom: "0.25rem"}}>
                        TOTAL PROCEEDS
                      </div>
                      <div style={{color: "#155724", fontSize: "1.5rem", fontWeight: "700"}}>
                        ${presaleData.tokensSold.toLocaleString()} USDC
                      </div>
                    </div>
                    
                    <div style={{
                      padding: "1rem",
                      backgroundColor: "#cce5ff",
                      borderRadius: "8px",
                      border: "1px solid #99d6ff",
                      textAlign: "center"
                    }}>
                      <div style={{color: "#003d82", fontSize: "0.8rem", fontWeight: "500", marginBottom: "0.25rem"}}>
                        WITHDRAWABLE AMOUNT
                      </div>
                      <div style={{color: "#003d82", fontSize: "1.5rem", fontWeight: "700"}}>
                        ${presaleData.totalProceeds.toLocaleString()} USDC
                      </div>
                    </div>
                  </div>

                  {/* Withdrawal Form */}
                  <div style={{
                    display: "flex",
                    gap: "1rem",
                    alignItems: "flex-end",
                    flexWrap: "wrap",
                    width: "100%"
                  }}>
                    <div style={{flex: "1", minWidth: "300px", maxWidth: "600px"}}>
                      <label style={{
                        display: "block",
                        marginBottom: "0.5rem",
                        color: "#495057",
                        fontWeight: "500",
                        fontSize: "0.9rem"
                      }}>
                        Receiving Address
                      </label>
                      <input 
                        type="text" 
                        value={receivingAddress}
                        onChange={(e) => setReceivingAddress(e.target.value)}
                        placeholder="Enter the address to receive proceeds..."
                        style={{
                          width: "100%",
                          maxWidth: "100%",
                          padding: "0.75rem",
                          border: "2px solid #e9ecef",
                          borderRadius: "8px",
                          fontSize: "0.9rem",
                          outline: "none",
                          transition: "border-color 0.15s ease-in-out",
                          boxSizing: "border-box",
                          fontFamily: "monospace"
                        }}
                        onFocus={(e) => e.target.style.borderColor = "#28a745"}
                        onBlur={(e) => e.target.style.borderColor = "#e9ecef"}
                      />
                    </div>
                    
                    <button 
                      onClick={handleWithdrawProceeds} 
                      disabled={isWithdrawing || !presaleData || presaleData.totalProceeds <= 0}
                      style={{
                        padding: "0.75rem 1.5rem",
                        backgroundColor: isWithdrawing || !presaleData || presaleData.totalProceeds <= 0 
                          ? "#6c757d" 
                          : "#28a745",
                        color: "white",
                        border: "none",
                        borderRadius: "8px",
                        fontSize: "0.9rem",
                        fontWeight: "500",
                        cursor: isWithdrawing || !presaleData || presaleData.totalProceeds <= 0 
                          ? "not-allowed" 
                          : "pointer",
                        transition: "background-color 0.15s ease-in-out",
                        whiteSpace: "nowrap",
                        minWidth: "160px"
                      }}
                      onMouseOver={(e) => {
                        if (!isWithdrawing && presaleData && presaleData.totalProceeds > 0) {
                          (e.target as HTMLButtonElement).style.backgroundColor = "#218838";
                        }
                      }}
                      onMouseOut={(e) => {
                        if (!isWithdrawing && presaleData && presaleData.totalProceeds > 0) {
                          (e.target as HTMLButtonElement).style.backgroundColor = "#28a745";
                        }
                      }}
                    >
                      {isWithdrawing ? "Withdrawing..." : "Withdraw Proceeds"}
                    </button>
                  </div>
                  
                  {withdrawError && (
                    <div style={{
                      marginTop: "1rem",
                      padding: "0.75rem",
                      backgroundColor: "#f8d7da",
                      border: "1px solid #f5c6cb",
                      borderRadius: "6px",
                      color: "#721c24",
                      fontSize: "0.9rem"
                    }}>
                      ❌ {withdrawError}
                    </div>
                  )}

                  <div style={{
                    marginTop: "1rem",
                    padding: "0.75rem",
                    backgroundColor: "#d4edda",
                    border: "1px solid #c3e6cb",
                    borderRadius: "6px",
                    color: "#155724",
                    fontSize: "0.85rem"
                  }}>
                    ℹ️ <strong>Note:</strong> This action requires both admin and super admin privileges. 
                    The proceeds will be transferred to the specified address as USDC tokens.
                  </div>
                </>
              ) : (
                <div style={{
                  textAlign: "center",
                  padding: "2rem",
                  color: "#6c757d"
                }}>
                  <div style={{fontSize: "1.5rem", marginBottom: "0.5rem"}}>⏳</div>
                  <p>Loading proceeds data...</p>
                </div>
              )}
            </div>

            {/* Trading Activation Card - Full Width */}
            <div style={{
              backgroundColor: "white",
              borderRadius: "12px",
              padding: "1.5rem",
              boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
              border: "1px solid #e0e0e0",
              gridColumn: "1 / -1"
            }}>
              <h2 style={{
                margin: "0 0 1.5rem 0",
                color: "#1a1a1a",
                fontSize: "1.25rem",
                fontWeight: "600"
              }}>
                🚀 End Presale & Activate Trading
              </h2>
              
              {presaleData ? (
                <>
                  {/* Activation Criteria Status */}
                  <div style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                    gap: "1rem",
                    marginBottom: "2rem"
                  }}>
                    {/* Offering Status Criteria */}
                    <div style={{
                      padding: "1rem",
                      backgroundColor: offeringStatus === OFFERING_STATE_ACTIVE ? "#d4edda" : "#f8f9fa",
                      borderRadius: "8px",
                      border: `1px solid ${offeringStatus === OFFERING_STATE_ACTIVE ? "#c3e6cb" : "#e9ecef"}`,
                      display: "flex",
                      alignItems: "center",
                      gap: "0.75rem"
                    }}>
                      <div style={{
                        fontSize: "1.5rem"
                      }}>
                        {offeringStatus === OFFERING_STATE_ACTIVE ? "✅" : "❌"}
                      </div>
                      <div>
                        <div style={{
                          color: offeringStatus === OFFERING_STATE_ACTIVE ? "#155724" : "#6c757d",
                          fontSize: "0.8rem",
                          fontWeight: "500",
                          marginBottom: "0.25rem"
                        }}>
                          OFFERING STATUS
                        </div>
                        <div style={{
                          color: offeringStatus === OFFERING_STATE_ACTIVE ? "#155724" : "#495057",
                          fontSize: "0.9rem",
                          fontWeight: "600"
                        }}>
                          {getStatusName(offeringStatus)}
                        </div>
                      </div>
                    </div>

                    {/* Time Criteria */}
                    <div style={{
                      padding: "1rem",
                      backgroundColor: Date.now() > offeringEndTimeMs ? "#d4edda" : "#f8f9fa",
                      borderRadius: "8px",
                      border: `1px solid ${Date.now() > offeringEndTimeMs ? "#c3e6cb" : "#e9ecef"}`,
                      display: "flex",
                      alignItems: "center",
                      gap: "0.75rem"
                    }}>
                      <div style={{
                        fontSize: "1.5rem"
                      }}>
                        {Date.now() > offeringEndTimeMs ? "✅" : "⏳"}
                      </div>
                      <div>
                        <div style={{
                          color: Date.now() > offeringEndTimeMs ? "#155724" : "#6c757d",
                          fontSize: "0.8rem",
                          fontWeight: "500",
                          marginBottom: "0.25rem"
                        }}>
                          PRESALE END TIME
                        </div>
                        <div style={{
                          color: Date.now() > offeringEndTimeMs ? "#155724" : "#495057",
                          fontSize: "0.9rem",
                          fontWeight: "600"
                        }}>
                          {Date.now() > offeringEndTimeMs ? "Time Elapsed" : "Still Active"}
                        </div>
                      </div>
                    </div>

                    {/* Tokens Sold Criteria */}
                    <div style={{
                      padding: "1rem",
                      backgroundColor: presaleData.availableTokens === 0 ? "#d4edda" : "#f8f9fa",
                      borderRadius: "8px",
                      border: `1px solid ${presaleData.availableTokens === 0 ? "#c3e6cb" : "#e9ecef"}`,
                      display: "flex",
                      alignItems: "center",
                      gap: "0.75rem"
                    }}>
                      <div style={{
                        fontSize: "1.5rem"
                      }}>
                        {presaleData.availableTokens === 0 ? "✅" : "📈"}
                      </div>
                      <div>
                        <div style={{
                          color: presaleData.availableTokens === 0 ? "#155724" : "#6c757d",
                          fontSize: "0.8rem",
                          fontWeight: "500",
                          marginBottom: "0.25rem"
                        }}>
                          TOKEN AVAILABILITY
                        </div>
                        <div style={{
                          color: presaleData.availableTokens === 0 ? "#155724" : "#495057",
                          fontSize: "0.9rem",
                          fontWeight: "600"
                        }}>
                          {presaleData.availableTokens === 0 ? "Fully Sold" : `${presaleData.availableTokens.toLocaleString()} Available`}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Activation Status */}
                  <div style={{
                    padding: "1rem",
                    backgroundColor: (offeringStatus === OFFERING_STATE_ACTIVE && (Date.now() > offeringEndTimeMs || presaleData.availableTokens === 0)) ? "#d1ecf1" : "#fff3cd",
                    border: `1px solid ${(offeringStatus === OFFERING_STATE_ACTIVE && (Date.now() > offeringEndTimeMs || presaleData.availableTokens === 0)) ? "#bee5eb" : "#ffeaa7"}`,
                    borderRadius: "8px",
                    marginBottom: "1.5rem",
                    textAlign: "center"
                  }}>
                    <div style={{
                      color: (offeringStatus === OFFERING_STATE_ACTIVE && (Date.now() > offeringEndTimeMs || presaleData.availableTokens === 0)) ? "#0c5460" : "#856404",
                      fontSize: "0.9rem",
                      fontWeight: "500",
                      marginBottom: "0.5rem"
                    }}>
                      <strong>Activation Status:</strong>
                    </div>
                    <div style={{
                      color: (offeringStatus === OFFERING_STATE_ACTIVE && (Date.now() > offeringEndTimeMs || presaleData.availableTokens === 0)) ? "#0c5460" : "#856404",
                      fontSize: "1rem",
                      fontWeight: "600"
                    }}>
                      {(offeringStatus === OFFERING_STATE_ACTIVE && (Date.now() > offeringEndTimeMs || presaleData.availableTokens === 0))
                        ? "✅ Ready to Activate Trading" 
                        : "⏳ Waiting for Criteria"}
                    </div>
                    <div style={{
                      color: "#6c757d",
                      fontSize: "0.8rem",
                      marginTop: "0.5rem",
                      fontStyle: "italic"
                    }}>
                      Trading requires: Active offering status AND (presale ends OR all tokens sold)
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div style={{ display: "flex", gap: "1rem", justifyContent: "center", flexWrap: "wrap" }}>
                    <button
                      onClick={handleEndOffering}
                      disabled={isEndingOffering || offeringStatus !== OFFERING_STATE_ACTIVE || (Date.now() <= offeringEndTimeMs && presaleData.availableTokens > 0)}
                      style={{
                        padding: "0.75rem 2rem",
                        backgroundColor: isEndingOffering || offeringStatus !== OFFERING_STATE_ACTIVE || (Date.now() <= offeringEndTimeMs && presaleData.availableTokens > 0)
                          ? "#6c757d"
                          : "#dc3545",
                        color: "white",
                        border: "none",
                        borderRadius: "8px",
                        fontSize: "1rem",
                        fontWeight: "500",
                        cursor: isEndingOffering || offeringStatus !== OFFERING_STATE_ACTIVE || (Date.now() <= offeringEndTimeMs && presaleData.availableTokens > 0)
                          ? "not-allowed"
                          : "pointer",
                        transition: "background-color 0.15s ease-in-out",
                        minWidth: "200px"
                      }}
                      onMouseOver={(e) => {
                        if (!isEndingOffering && offeringStatus === OFFERING_STATE_ACTIVE && (Date.now() > offeringEndTimeMs || presaleData.availableTokens === 0)) {
                          (e.target as HTMLButtonElement).style.backgroundColor = "#c82333";
                        }
                      }}
                      onMouseOut={(e) => {
                        if (!isEndingOffering && offeringStatus === OFFERING_STATE_ACTIVE && (Date.now() > offeringEndTimeMs || presaleData.availableTokens === 0)) {
                          (e.target as HTMLButtonElement).style.backgroundColor = "#dc3545";
                        }
                      }}
                    >
                      {isEndingOffering ? "Ending..." : "End Offering"}
                    </button>

                    <button 
                      onClick={handleActivateTrading} 
                      disabled={isActivatingTrading || offeringStatus !== OFFERING_STATE_ACTIVE || (Date.now() <= offeringEndTimeMs && presaleData.availableTokens > 0)}
                      style={{
                        padding: "0.75rem 2rem",
                        backgroundColor: isActivatingTrading || offeringStatus !== OFFERING_STATE_ACTIVE || (Date.now() <= offeringEndTimeMs && presaleData.availableTokens > 0)
                          ? "#6c757d" 
                          : "#007bff",
                        color: "white",
                        border: "none",
                        borderRadius: "8px",
                        fontSize: "1rem",
                        fontWeight: "500",
                        cursor: isActivatingTrading || offeringStatus !== OFFERING_STATE_ACTIVE || (Date.now() <= offeringEndTimeMs && presaleData.availableTokens > 0)
                          ? "not-allowed" 
                          : "pointer",
                        transition: "background-color 0.15s ease-in-out",
                        minWidth: "200px"
                      }}
                      onMouseOver={(e) => {
                        if (!isActivatingTrading && offeringStatus === OFFERING_STATE_ACTIVE && (Date.now() > offeringEndTimeMs || presaleData.availableTokens === 0)) {
                          (e.target as HTMLButtonElement).style.backgroundColor = "#0056b3";
                        }
                      }}
                      onMouseOut={(e) => {
                        if (!isActivatingTrading && offeringStatus === OFFERING_STATE_ACTIVE && (Date.now() > offeringEndTimeMs || presaleData.availableTokens === 0)) {
                          (e.target as HTMLButtonElement).style.backgroundColor = "#007bff";
                        }
                      }}
                    >
                      {isActivatingTrading ? "Activating..." : "Activate Trading"}
                    </button>
                  </div>
                  
                  {(activationError || endError) && (
                    <div style={{
                      marginTop: "1rem",
                      padding: "0.75rem",
                      backgroundColor: "#f8d7da",
                      border: "1px solid #f5c6cb",
                      borderRadius: "6px",
                      color: "#721c24",
                      fontSize: "0.9rem",
                      textAlign: "center"
                    }}>
                      ❌ {endError ?? activationError}
                    </div>
                  )}

                  <div style={{
                    marginTop: "1rem",
                    padding: "0.75rem",
                    backgroundColor: "#d1ecf1",
                    border: "1px solid #bee5eb",
                    borderRadius: "6px",
                    color: "#0c5460",
                    fontSize: "0.85rem",
                    textAlign: "center"
                  }}>
                    ℹ️ <strong>Note:</strong> This action requires admin privileges and will transition the offering from presale to trading phase.
                  </div>
                </>
              ) : (
                <div style={{
                  textAlign: "center",
                  padding: "2rem",
                  color: "#6c757d"
                }}>
                  <div style={{fontSize: "1.5rem", marginBottom: "0.5rem"}}>⏳</div>
                  <p>Loading activation data...</p>
                </div>
              )}
            </div>
          </>
        ) : (
          <div style={{
            gridColumn: "1 / -1",
            textAlign: "center",
            padding: "4rem 2rem",
            backgroundColor: "white",
            borderRadius: "12px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.1)"
          }}>
            <div style={{fontSize: "3rem", marginBottom: "1rem"}}>🔗</div>
            <h2 style={{color: "#1a1a1a", marginBottom: "0.5rem"}}>Connect Your Wallet</h2>
            <p style={{color: "#6c757d", marginBottom: "1.5rem"}}>
              Please connect your wallet to access the admin dashboard
            </p>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
