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

  // Prepare UserOperation to increment counter contract
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

  userOperation.preVerificationGas = BigInt(0);
  userOperation.maxFeePerGas = BigInt(0);
  userOperation.maxPriorityFeePerGas = BigInt(0);
  (userOperation as any).paymasterAndData = "0x";

  console.log("Initial UserOperation signature:", userOperation.signature.slice(0, 20) + "...");

  // Sign the UserOperation
  console.log("Signing UserOperation...");
  const signedUserOp = await account.signUserOperation(userOperation);
  
  console.log("Signed UserOp result:", signedUserOp);
  console.log("Type of result:", typeof signedUserOp);
  
  // Check if signedUserOp is a string (signature) or object with signature property
  if (typeof signedUserOp === 'string') {
    userOperation.signature = signedUserOp;
  } else if (signedUserOp && signedUserOp.signature) {
    userOperation.signature = signedUserOp.signature;
  } else {
    throw new Error('Failed to get signature from signUserOperation');
  }
  
  console.log("New signature:", userOperation.signature.slice(0, 20) + "...");
  console.log("Signature length:", userOperation.signature.length);

  // Submit to Gelato
  console.log("Submitting UserOperation to Gelato...");
  const taskId = await sendUserOperationToGelato(
    entryPointAddress,
    userOperation as UserOperation,
    chainID,
    apiKey!
  );

  if (taskId) {
    console.log("UserOperation submitted successfully!");
    console.log("Gelato Task ID:", taskId);
    console.log("Track at: https://api.gelato.digital/tasks/status/" + taskId);
  } else {
    console.log("Failed to submit UserOperation");
  }
}

export const sendUserOperationToGelato = async (
  entryPointAddress: `0x${string}`,
  sponsoredUserOperation: UserOperation,
  chainID: number,
  apiKey: string,
) => {
  console.log(`\nSending UserOperation with EntryPoint v0.7`)
  
  // v0.7 format - following Gelato's exact specification
  const userOpForSubmission = {
    sender: sponsoredUserOperation.sender,
    nonce: "0x" + sponsoredUserOperation.nonce.toString(16),
    // Only include factory/factoryData if they exist (account not deployed yet)
    ...(sponsoredUserOperation.factory && sponsoredUserOperation.factory !== "0x" ? {
      factory: sponsoredUserOperation.factory,
      factoryData: sponsoredUserOperation.factoryData || "0x",
    } : {}),
    callData: sponsoredUserOperation.callData,
    maxFeePerGas: "0x0", // Zero for 1Balance
    maxPriorityFeePerGas: "0x0", // Zero for 1Balance
    preVerificationGas: "0x0", // Zero for 1Balance
    signature: sponsoredUserOperation.signature,
    callGasLimit: "0x" + sponsoredUserOperation.callGasLimit.toString(16),
    verificationGasLimit: "0x" + sponsoredUserOperation.verificationGasLimit.toString(16),
  };

  const submitOptions = {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({
      id: 1,
      jsonrpc: '2.0',
      method: 'eth_sendUserOperation',
      params: [userOpForSubmission, entryPointAddress],
    }),
  }

  console.log('\nSending UserOperation submission request:', JSON.stringify(userOpForSubmission, null, 2))

  let responseValues: any
  await fetch(`https://api.gelato.digital//bundlers/${chainID}/rpc?sponsorApiKey=${apiKey}`, submitOptions)
    .then((response) => response.json())
    .then((response) => (responseValues = response))
    .catch((err) => console.error(err))
  
  console.log('\nReceived response from Gelato.')

  let taskId
  if (responseValues && responseValues['result']) {
    taskId = responseValues['result']
    console.log('UserOperation submission successful:', taskId)
  } else {
    console.log('Error or no result from Gelato:', responseValues?.error || responseValues)
  }

  return taskId
}

// Simple ES module execution
main().catch((err) => {
  console.error('❌ Script failed:', err);
  process.exit(1);
});