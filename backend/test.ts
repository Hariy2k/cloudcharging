import supertest from "supertest";
import { buildApp } from "./app";
import { performance } from "perf_hooks";

const app = supertest(buildApp());
const TEST_ACCOUNT = "test_account";
const INITIAL_BALANCE = 100;
const CHARGE_AMOUNT = 10;

async function resetAccount() {
    await app.post("/reset").send({ account: TEST_ACCOUNT }).expect(204);
}

async function chargeAccount() {
    return app.post("/charge")
        .send({ account: TEST_ACCOUNT, charges: CHARGE_AMOUNT })
        .expect(200);
}

async function runConcurrentTest(numRequests: number) {
    // Reset account to initial state
    await resetAccount();
    
    console.log(`Starting concurrent test with ${numRequests} requests...`);
    const start = performance.now();
    
    // Create array of concurrent charge requests
    const requests = Array(numRequests).fill(null).map(() => chargeAccount());
    
    // Wait for all requests to complete
    const results = await Promise.all(requests);
    
    const duration = performance.now() - start;
    console.log(`Completed ${numRequests} requests in ${duration.toFixed(2)}ms`);
    console.log(`Average latency: ${(duration / numRequests).toFixed(2)}ms per request`);
    
    // Get the final result which has the actual final balance
    const finalResult = results[results.length - 1].body;
    const successfulCharges = results.filter(r => r.body.isAuthorized).length;
    const maxPossibleCharges = Math.min(numRequests, Math.floor(INITIAL_BALANCE / CHARGE_AMOUNT));
    
    console.log(`Successful charges: ${successfulCharges}`);
    console.log(`Expected successful charges: ${maxPossibleCharges}`);
    console.log(`Final balance: ${finalResult.remainingBalance}`);
    
    // Verify no negative balance
    const hasNegativeBalance = results.some(r => r.body.remainingBalance < 0);
    console.log(`Negative balance detected: ${hasNegativeBalance}`);
    
    // Verify consistency
    if (successfulCharges !== maxPossibleCharges) {
        throw new Error(`Inconsistent number of successful charges. Expected ${maxPossibleCharges}, got ${successfulCharges}`);
    }
    
    if (hasNegativeBalance) {
        throw new Error("Negative balance detected - this should never happen");
    }
    
    // The final balance should match what's reported in the final response
    if (finalResult.remainingBalance < 0) {
        throw new Error(`Negative balance detected: ${finalResult.remainingBalance}`);
    }

    return {
        duration,
        successfulCharges,
        maxPossibleCharges,
        hasNegativeBalance,
        finalBalance: finalResult.remainingBalance
    };
}

async function basicLatencyTest() {
    console.log("\nRunning basic latency test...");
    await resetAccount();
    const start = performance.now();
    await chargeAccount();
    await chargeAccount();
    await chargeAccount();
    await chargeAccount();
    await chargeAccount();
    const duration = performance.now() - start;
    console.log(`Basic latency test completed in ${duration.toFixed(2)}ms`);
    console.log(`Average latency: ${(duration / 5).toFixed(2)}ms per request\n`);
}

async function runTests() {
    try {
        // Run original basic latency test
        await basicLatencyTest();

        // Run concurrent load tests
        console.log("\nRunning concurrent load tests...\n");
        await runConcurrentTest(5);  // Light load
        await runConcurrentTest(10); // Medium load
        await runConcurrentTest(20); // Heavy load
        
        console.log("\nAll tests passed successfully! ✅");
    } catch (error) {
        console.error("\n❌ Test failed:", error);
        process.exit(1);
    } finally {
        process.exit(0);
    }
}

runTests();
