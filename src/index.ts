import { ethers } from 'ethers';
import * as dotenv from 'dotenv';

dotenv.config();

// Entry Point v0.7 address
const ENTRY_POINT_V07 = "0x0000000071727De22E5E9d8BAf0edAc6f37da032";

async function testUserOperationWithGelato() {
  try {
    console.log("🚀 Testing Safe Smart Account + Gelato UserOperation...");
    
    const apiKey = process.env.GELATO_API_KEY;
    const safeAddress = process.env.SAFE_ADDRESS;
    
    if (!apiKey || !safeAddress) {
      throw new Error("Missing GELATO_API_KEY or SAFE_ADDRESS in environment variables");
    }
    
    const url = `https://api.gelato.digital/bundlers/11155111/rpc?sponsorApiKey=${apiKey}`;
    console.log("Safe Address:", safeAddress);
    console.log("URL:", url.replace(apiKey, "***"));

    // Step 1: Get nonce from Entry Point
    console.log("\n1. Getting nonce from Entry Point...");
    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
    const entryPointABI = ["function getNonce(address sender, uint192 key) external view returns (uint256 nonce)"];
    const entryPoint = new ethers.Contract(ENTRY_POINT_V07, entryPointABI, provider);
    const nonce = await entryPoint.getNonce(safeAddress, 0);
    console.log("Nonce:", nonce.toString());

    // Step 2: Create simple UserOperation for gas estimation
    const userOp = {
      sender: safeAddress,
      nonce: `0x${nonce.toString(16)}`,
      initCode: "0x", // Empty for existing Safe
      callData: "0x", // Zero operation
      signature: "0xfffffffffffffffffffffffffffffff0000000000000000000000000000000007aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1c" // Dummy signature
    };

    console.log("\n2. UserOperation for gas estimation:");
    console.log(JSON.stringify(userOp, null, 2));

    // Step 3: Estimate gas using Gelato
    console.log("\n3. Estimating gas with Gelato...");
    
    const gasResponse = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        id: 1,
        jsonrpc: "2.0",
        method: "eth_estimateUserOperationGas",
        params: [userOp, ENTRY_POINT_V07]
      })
    });

    console.log("Gas Estimation Response Status:", gasResponse.status);
    const gasResult = await gasResponse.json();
    console.log("Gas Estimation Response:", JSON.stringify(gasResult, null, 2));

    if (gasResult.error) {
      console.error("❌ Gas Estimation Error:", gasResult.error);
      return;
    }

    if (gasResult.result) {
      console.log("✅ Gas Estimation Success!");
      console.log("Call Gas Limit:", gasResult.result.callGasLimit);
      console.log("Verification Gas Limit:", gasResult.result.verificationGasLimit);
      console.log("Pre-verification Gas:", gasResult.result.preVerificationGas);
    }

  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  }
}

// Execute the function
testUserOperationWithGelato()
  .then(() => {
    console.log("\n✅ UserOperation test completed!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Test failed:", error);
    process.exit(1);
  });