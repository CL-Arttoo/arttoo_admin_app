This is the administrator page for arttoo.

## Done
- [x] Update offering end time

## To-Do
- [ ] Withdraw proceeds
- [ ] Activate trading phase
- [ ] ...

It is used to for admin to update end time(done), withdraw proceeds(to-do), activate trading phase(tio-do) and etc.

## Project Structure

This project is a React application for interacting with the Arttoo Sui smart contract.

-   `src/App.tsx`: The main application component that handles wallet connection, displays information from the blockchain, and provides an interface for administrative actions.
-   `src/index.tsx`: The entry point of the React application.
-   `public/`: Contains the base `index.html` file.

## Getting Started

### Prerequisites

-   Node.js and npm (or yarn)
-   A Sui-compatible wallet (e.g., Sui Wallet)

### Installation & Running

1.  Clone the repository.
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  Start the development server:
    ```bash
    npm start
    ```
This will open the application in your browser at `http://localhost:3000`.

## Functionality

This application provides the following features for administrators of the Arttoo platform:

*   **Connect Wallet:** Connect to a Sui wallet to interact with the application.
*   **View Information:**
    *   Displays the connected wallet's address.
    *   Shows the SUI balance of the connected wallet.
    *   Fetches and displays the current end time for the offering from the smart contract.
*   **Update Offering End Time:** Allows an administrator to set a new end time for the offering. This is a privileged action that requires an admin proof from the smart contract.

## Smart Contract Interaction

The application interacts with a Sui smart contract with the following details:

-   **Package ID:** `0x9d11135054b1ab5f53653b88fb83979255417e6c6049ac91535b78c0d4803976`
-   **Mainnet RPC URL:** `https://fullnode.mainnet.sui.io:443`