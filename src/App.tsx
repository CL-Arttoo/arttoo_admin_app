import { useCallback, useEffect, useState } from 'react';
import './App.css';
import { ConnectButton, useCurrentAccount, useSignAndExecuteTransaction } from "@mysten/dapp-kit";
import "@mysten/dapp-kit/dist/index.css";
import { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { bcs } from '@mysten/sui/bcs';

const PACKAGE_ID = "0x9d11135054b1ab5f53653b88fb83979255417e6c6049ac91535b78c0d4803976";
const OFFERING_OBJECT_ID = "0xe24160d0aa7ca299cf608144b0abe109b8ca5c0a612e38c9a1aec18a1130c451";
const REGISTRY_OBJECT_ID = "0x26407ed0fa0324604960fb38d747a8c2e36dedefb55918949d5c27ec502c650e";
const VAULT_OBJECT_ID = "0x8e6be131f12236f4340e96c97ac0e2466b8cfe32e7dbc486d888bbd1dc4a70b1";

// It's generally better to use a client from a provider, but for this simple query a new client is fine.
const suiClient = new SuiClient({ url: 'https://fullnode.mainnet.sui.io:443' });

function App() {
  const account = useCurrentAccount();
  const { mutate: signAndExecute } = useSignAndExecuteTransaction();
  const [balance, setBalance] = useState<string | null>(null);
  const [offeringEndTime, setOfferingEndTime] = useState<string | null>(null);
  const [offeringEndTimeMs, setOfferingEndTimeMs] = useState<number>(0);
  const [newEndTime, setNewEndTime] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);

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

  useEffect(() => {
    if (account) {
      // Fetch balance
      suiClient.getBalance({ owner: account.address }).then(balanceRes => {
        setBalance(String(Number(balanceRes.totalBalance) / 10 ** 9));
      });

      fetchOfferingEndTime();
    }
  }, [account, fetchOfferingEndTime]);

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
        typeArguments: [`${PACKAGE_ID}::role_store::Admin`]
    });

    const offering = tx.moveCall({
      target: `${PACKAGE_ID}::artwork::receive_offering`,
      arguments: [
        tx.object(REGISTRY_OBJECT_ID), // Assuming REGISTRY_OBJECT_ID is the vault
        proof,
        tx.object(OFFERING_OBJECT_ID)
      ],
      typeArguments: ['0x1e55cc88c0cefbaab52a129dabb79097f563391f015bef682bac46247f3fa2e4::loj::LOJ']
    });

    tx.moveCall({
      target: `${PACKAGE_ID}::offering::update_end_time`,
      arguments: [
        offering,
        proof,
        tx.pure(bcs.u64().serialize(newEndTimeMs))
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
    <div className="App">
      <header className="App-header">
        <ConnectButton />
        {account && (
          <>
            <p>Connected Address: {account.address}</p>
            <p>SUI Balance: {balance ?? 'Loading...'}</p>
            <p>Offering End Time: {offeringEndTime ?? 'Loading...'}</p>
            <p style={{fontSize: "0.8rem", fontStyle: "italic", marginTop: "10px"}}>
              The offering end time is displayed in your local timezone.
            </p>

            <div style={{marginTop: "20px"}}>
              <h3>Update Offering End Time</h3>
              <input 
                type="datetime-local" 
                onChange={(e) => setNewEndTime(e.target.value)}
                style={{marginRight: "10px"}}
              />
              <button onClick={handleUpdateEndTime} disabled={isUpdating}>
                {isUpdating ? "Updating..." : "Update End Time"}
              </button>
              {updateError && <p style={{color: "red", fontSize: "0.8rem"}}>{updateError}</p>}
            </div>
          </>
        )}
      </header>
    </div>
  );
}

export default App;
