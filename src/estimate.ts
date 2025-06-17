import { createPublicClient, http } from 'viem'
import { createBundlerClient, type UserOperation as ViemUserOperation } from 'viem/account-abstraction'
import { privateKeyToAccount } from 'viem/accounts'

// Permissionless.js imports for Safe Smart Account
import { toSafeSmartAccount } from 'permissionless/accounts'
import { polygon } from 'viem/chains'
import dotenv from 'dotenv'

// Extended UserOperation type to include paymasterAndData
type UserOperation = ViemUserOperation & {
  paymasterAndData?: `0x${string}`
}

dotenv.config();

const entryPointAddress = "0x0000000071727De22E5E9d8BAf0edAc6f37da032"; // entrypoint 0.7 address
const chainID = 137;
const apiKey = process.env.GELATO_API_KEY;

type gasData = {
  preVerificationGas: `0x${string}`
  callGasLimit: `0x${string}`
  verificationGasLimit: `0x${string}`
}

const detectEntryPointVersion = (entryPointAddress: string) => {
  return entryPointAddress === "0x0000000071727De22E5E9d8BAf0edAc6f37da032" ? 'v0.7' : 'v0.6';
};

async function main() {
  if (!apiKey) throw new Error('Missing GELATO_API_KEY in env');
  if (!process.env.PRIVATE_KEY) throw new Error('Missing PRIVATE_KEY in env');
  if (!process.env.RPC_URL) throw new Error('Missing RPC_URL in env');

  const publicClient = createPublicClient({
    chain: polygon,
    transport: http(process.env.RPC_URL)
  });

  const signer = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);

  const account = await toSafeSmartAccount({
    client: publicClient,
    entryPoint: { address: entryPointAddress, version: "0.7" },
    owners: [signer],
    saltNonce: BigInt(0),
    version: "1.4.1",
  });

  console.log("Safe account address:", account.address);

  // Check if account is deployed via both local RPC and bundler
  const code = await publicClient.getCode({ address: account.address });
  const isDeployed = code && code !== '0x';
  console.log("Account deployed (local RPC):", isDeployed);
  
  // Also check via bundler to see if it agrees
  try {
    const bundlerCode = await bundlerClient.getCode({ address: account.address });
    const isBundlerDeployed = bundlerCode && bundlerCode !== '0x';
    console.log("Account deployed (bundler RPC):", isBundlerDeployed);
  } catch (e) {
    console.log("Bundler RPC doesn't support getCode, assuming different state");
  }

  const bundlerClient = createBundlerClient({
    client: publicClient,
    transport: http(
      `https://api.gelato.digital//bundlers/${chainID}/rpc?sponsorApiKey=${apiKey}`
    ),
  });

  // Use a different target contract that doesn't have isGelatoRelay restriction
  // Option 1: Use a simple transfer (send 0 ETH to yourself)
  const userOperation = await bundlerClient.prepareUserOperation({
    account,
    calls: [
      {
        to: account.address, // Send to yourself
        value: BigInt(0), // 0 ETH
        data: "0x", // Empty data
      },
    ],
    maxFeePerGas: BigInt(0),
    maxPriorityFeePerGas: BigInt(0),
  });

  console.log("UserOperation prepared:");
  console.log("- Factory:", userOperation.factory);
  console.log("- FactoryData:", userOperation.factoryData);
  console.log("- Sender:", userOperation.sender);

  // Ensure factory and factoryData are properly set for undeployed accounts
  let sponsoredUserOperation: UserOperation = {
    sender: userOperation.sender,
    nonce: userOperation.nonce,
    callData: userOperation.callData,
    callGasLimit: userOperation.callGasLimit,
    verificationGasLimit: userOperation.verificationGasLimit,
    preVerificationGas: userOperation.preVerificationGas,
    maxFeePerGas: userOperation.maxFeePerGas,
    maxPriorityFeePerGas: userOperation.maxPriorityFeePerGas,
    signature: userOperation.signature,
    paymasterAndData: "0x" as `0x${string}`, // Zero for 1Balance
  };

  // Handle factory/factoryData based on deployment status
  if (!isDeployed) {
    // Account not deployed - factory data is required
    if (userOperation.factory && userOperation.factoryData) {
      sponsoredUserOperation.factory = userOperation.factory as `0x${string}`;
      sponsoredUserOperation.factoryData = userOperation.factoryData as `0x${string}`;
      console.log("Added deployment data for undeployed account");
      console.log("- Factory:", sponsoredUserOperation.factory);
      console.log("- FactoryData length:", sponsoredUserOperation.factoryData?.length);
    } else {
      console.error("Account not deployed and no factory data available!");
      console.log("UserOperation keys:", Object.keys(userOperation));
      throw new Error("Cannot proceed without factory data for account deployment");
    }
  } else {
    // Account already deployed - factory data not needed
    console.log("✅ Account already deployed, factory data not required");
    // Don't include factory/factoryData for deployed accounts
  }

  console.log("Getting gas estimation with deployment data...");
  const rvGas = await getGasValuesFromGelato(
    entryPointAddress,
    sponsoredUserOperation,
    chainID,
    apiKey!
  );

  if (!rvGas) {
    throw new Error("Failed to get gas estimation from Gelato");
  }

  console.log("Gas estimation received:", rvGas);
}

export const getGasValuesFromGelato = async (
  entryPointAddress: `0x${string}`,
  sponsoredUserOperation: UserOperation,
  chainID: number,
  apiKey: string,
) => {
  const version = detectEntryPointVersion(entryPointAddress)
  console.log(`\nDetected EntryPoint version: ${version}`)
  
  let userOpForEstimation: any

  if (version === 'v0.7') {
    // v0.7 format - ensure factory/factoryData are included if present
    userOpForEstimation = {
      sender: sponsoredUserOperation.sender,
      nonce: "0x" + sponsoredUserOperation.nonce.toString(16),
      callData: sponsoredUserOperation.callData,
      maxFeePerGas: `0x${sponsoredUserOperation.maxFeePerGas.toString(16)}`,
      maxPriorityFeePerGas: `0x${sponsoredUserOperation.maxPriorityFeePerGas.toString(16)}`,
      preVerificationGas: `0x${sponsoredUserOperation.preVerificationGas.toString(16)}`,
      signature: sponsoredUserOperation.signature,
      callGasLimit: `0x${sponsoredUserOperation.callGasLimit.toString(16)}`,
      verificationGasLimit: `0x${sponsoredUserOperation.verificationGasLimit.toString(16)}`,
    };

    // Include factory/factoryData only if they exist (for account deployment)
    if (sponsoredUserOperation.factory && sponsoredUserOperation.factory !== "0x") {
      userOpForEstimation.factory = sponsoredUserOperation.factory;
      userOpForEstimation.factoryData = sponsoredUserOperation.factoryData || "0x";
      console.log("Including factory data for account deployment:");
      console.log("- Factory:", userOpForEstimation.factory);
      console.log("- FactoryData:", userOpForEstimation.factoryData);
    } else {
      console.log("No factory data - account already deployed");
    }
  } 

  const gasOptions = {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({
      id: 1,
      jsonrpc: '2.0',
      method: 'eth_estimateUserOperationGas',
      params: [userOpForEstimation, entryPointAddress],
    }),
  }

  console.log('\nSending gas estimation request:')
  console.log('UserOp keys:', Object.keys(userOpForEstimation))
  console.log('Has factory:', !!userOpForEstimation.factory)
  console.log('Has factoryData:', !!userOpForEstimation.factoryData)

  let responseValues: any
  await fetch(`https://api.gelato.digital//bundlers/${chainID}/rpc?sponsorApiKey=${apiKey}`, gasOptions)
    .then((response) => response.json())
    .then((response) => (responseValues = response))
    .catch((err) => console.error(err))
  
  console.log('\nReceived Gas Data from Gelato.')

  let rvGas
  if (responseValues && responseValues['result']) {
    rvGas = responseValues['result'] as gasData
    console.log('Gas estimation successful:', rvGas)
  } else {
    console.log('Error or no result from Gelato:', responseValues?.error || responseValues)
  }

  return rvGas
}

// Simple ES module execution
main().catch((err) => {
  console.error('❌ Script failed:', err);
  process.exit(1);
});