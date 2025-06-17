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

  const bundlerClient = createBundlerClient({
    client: publicClient,
    transport: http(
      `https://api.gelato.digital//bundlers/${chainID}/rpc?sponsorApiKey=${apiKey}`
    ),
  });

  const userOperation = await bundlerClient.prepareUserOperation({
    account,
    calls: [
      {
        to: "0x....", // Counter contract on Polygon (needs to be deployed)
        data: "0xd09de08a", // increment() function selector
      },
    ],
    maxFeePerGas: BigInt(0),
    maxPriorityFeePerGas: BigInt(0),
  });
  //console.log("UserOperation prepared:", userOperation);

  let sponsoredUserOperation: UserOperation = {
    sender: userOperation.sender,
    nonce: userOperation.nonce,
    factory: userOperation.factory as `0x${string}`,
    factoryData: userOperation.factoryData as `0x${string}`,
    callData: userOperation.callData,
    callGasLimit: userOperation.callGasLimit,
    verificationGasLimit: userOperation.verificationGasLimit,
    preVerificationGas: userOperation.preVerificationGas,
    maxFeePerGas: userOperation.maxFeePerGas,
    maxPriorityFeePerGas: userOperation.maxPriorityFeePerGas,
    signature: userOperation.signature,
    paymasterAndData: "0x" as `0x${string}`, // Zero for 1Balance
  };
  //console.log("Initial UserOperation values set for v0.7 gas estimation");

  // Sign the UserOperation first with reasonable gas estimates
  //console.log("Signing UserOperation for gas estimation...");
  //console.log("UserOperation signed with temporary gas values.");

  //console.log("Getting gas estimation with real signature...");
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
    // v0.7 format - same as sendTxn script
    userOpForEstimation = {
      sender: sponsoredUserOperation.sender,
      nonce: "0x" + sponsoredUserOperation.nonce.toString(16),
      // Only include factory/factoryData if they exist (account not deployed yet)
      ...(sponsoredUserOperation.factory && sponsoredUserOperation.factory !== "0x" ? {
        factory: sponsoredUserOperation.factory,
        factoryData: sponsoredUserOperation.factoryData || "0x",
      } : {}),
      callData: sponsoredUserOperation.callData,
      maxFeePerGas: `0x${sponsoredUserOperation.maxFeePerGas.toString(16)}`,
      maxPriorityFeePerGas: `0x${sponsoredUserOperation.maxPriorityFeePerGas.toString(16)}`,
      preVerificationGas: `0x${sponsoredUserOperation.preVerificationGas.toString(16)}`,
      signature: sponsoredUserOperation.signature,
      callGasLimit: `0x${sponsoredUserOperation.callGasLimit.toString(16)}`,
      verificationGasLimit: `0x${sponsoredUserOperation.verificationGasLimit.toString(16)}`,
    };
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

  console.log('\nSending gas estimation request:', JSON.stringify(userOpForEstimation, null, 2))

  let responseValues: any
  await fetch(`https://api.gelato.digital//bundlers/${chainID}/rpc?sponsorApiKey=${apiKey}`, gasOptions)
    .then((response) => response.json())
    .then((response) => (responseValues = response))
    .catch((err) => console.error(err))
  
  console.log('\nReceived Gas Data from Gelato.')

  let rvGas
  if (responseValues && responseValues['result']) {
    rvGas = responseValues['result'] as gasData
    //console.log('Gas estimation successful:', rvGas)
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