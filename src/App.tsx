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

// testnet
// const rpc_url = "https://fullnode.testnet.sui.io:443";
// const PACKAGE_ID = "0xff0839064b38e03c1f873a667403e99e7e7fd2e905340d3f283b5e6ac06d293b";
// const OFFERING_OBJECT_ID = "0xbdedd42c7d14f41d408e444d46cba3ba5c8578c56b72a6c8c03521bb27f9544f";
// const REGISTRY_OBJECT_ID = "0x5e7d8a64811de9e676cb29e759757096daad6dfcf93bc5584cbe6f21a020c9be";
// const VAULT_OBJECT_ID = "0x3e5e21d08644b85b686ca076c0bd9fc4f62721a12ddb5a519bfc7dc433af0e6b";
// const COIN_TYPE = "0x63ffab44beea2cb7b1c0a97bd02a0103dfdc2e9e421ffb42dbde8a69ffcdda32::coin_template::COIN_TEMPLATE";

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

  // Presale information state
  const [presaleData, setPresaleData] = useState<{
    tokenAllocation: number;
    tokensSold: number;
    availableTokens: number;
    totalProceeds: number;
    totalFees: number;
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
    
    // Fetch total fees
    tx.moveCall({
      target: `${PACKAGE_ID}::offering::total_fees`,
      arguments: [tx.object(OFFERING_OBJECT_ID)],
    });

    suiClient.devInspectTransactionBlock({
      sender: account!.address,
      transactionBlock: tx,
    }).then(res => {
      console.log("Presale data fetch result:", res);
      if (res.results && res.results.length >= 5) {
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
          
          // Parse total fees (command 4)
          const totalFeesRaw = res.results[4]?.returnValues?.[0]?.[0];
          if (!totalFeesRaw) throw new Error("Missing total fees data");
          const totalFeesView = new DataView(new Uint8Array(totalFeesRaw).buffer);
          const totalFees = Number(totalFeesView.getBigUint64(0, true)) / 1_000_000; // Convert from 6 decimals (USDC)
          
          setPresaleData({
            tokenAllocation,
            tokensSold,
            availableTokens,
            totalProceeds,
            totalFees
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

  useEffect(() => {
    if (account) {
      // Fetch balance
      suiClient.getBalance({ owner: account.address }).then(balanceRes => {
        setBalance(String(Number(balanceRes.totalBalance) / 10 ** 9));
      });

      fetchOfferingEndTime();
      fetchPresaleData(); // Fetch presale data on mount
    }
  }, [account, fetchOfferingEndTime, fetchPresaleData]);

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
                <p style={{fontSize: "0.8rem", fontStyle: "italic", color: "#888", margin: "0.5rem 0 0 0"}}>
                  Time displayed in your local timezone
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
                        TOTAL PROCEEDS
                      </div>
                      <div style={{color: "#155724", fontSize: "1.25rem", fontWeight: "700"}}>
                        ${presaleData.totalProceeds.toLocaleString()} USDC
                      </div>
                    </div>
                    
                    <div style={{
                      padding: "1rem",
                      backgroundColor: "#fff3cd",
                      borderRadius: "8px",
                      border: "1px solid #ffeaa7"
                    }}>
                      <div style={{color: "#856404", fontSize: "0.8rem", fontWeight: "500", marginBottom: "0.25rem"}}>
                        TOTAL FEES
                      </div>
                      <div style={{color: "#856404", fontSize: "1.25rem", fontWeight: "700"}}>
                        ${presaleData.totalFees.toLocaleString()} USDC
                      </div>
                    </div>
                    
                    <div style={{
                      padding: "1rem",
                      backgroundColor: "#cce5ff",
                      borderRadius: "8px",
                      border: "1px solid #99d6ff"
                    }}>
                      <div style={{color: "#003d82", fontSize: "0.8rem", fontWeight: "500", marginBottom: "0.25rem"}}>
                        NET PROCEEDS
                      </div>
                      <div style={{color: "#003d82", fontSize: "1.25rem", fontWeight: "700"}}>
                        ${(presaleData.totalProceeds - presaleData.totalFees).toLocaleString()} USDC
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
