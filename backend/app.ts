import express from "express";
import { createClient } from "redis";
import { json } from "body-parser";

const DEFAULT_BALANCE = 100;

interface ChargeResult {
    isAuthorized: boolean;
    remainingBalance: number;
    charges: number;
}

// Lua script for atomic charge operation
const CHARGE_SCRIPT = `
local balance = tonumber(redis.call('GET', KEYS[1]))
local charges = tonumber(ARGV[1])

if not balance then
    return {false, 0, 0}
end

if balance >= charges then
    local newBalance = balance - charges
    redis.call('SET', KEYS[1], newBalance)
    return {true, newBalance, charges}
else
    return {false, balance, 0}
end
`;

let redisClient: ReturnType<typeof createClient> | null = null;

async function getClient(): Promise<ReturnType<typeof createClient>> {
    if (!redisClient) {
        const url = `redis://${process.env.REDIS_HOST ?? "localhost"}:${process.env.REDIS_PORT ?? "6379"}`;
        console.log(`Using redis URL ${url}`);
        redisClient = createClient({ url });
        await redisClient.connect();
    }
    return redisClient;
}

async function reset(account: string): Promise<void> {
    const client = await getClient();
    await client.set(`${account}/balance`, DEFAULT_BALANCE);
}

async function charge(account: string, charges: number): Promise<ChargeResult> {
    const client = await getClient();
    try {
        // Execute atomic Lua script
        const result = await client.eval(
            CHARGE_SCRIPT,
            {
                keys: [`${account}/balance`],
                arguments: [charges.toString()]
            }
        );

        // Parse Lua script result
        const [isAuthorized, remainingBalance, actualCharges] = result as [boolean, number, number];
        return {
            isAuthorized,
            remainingBalance,
            charges: actualCharges
        };
    } catch (error) {
        console.error("Error during charge operation:", error);
        throw error;
    }
}

// Cleanup function for graceful shutdown
async function cleanup() {
    if (redisClient) {
        await redisClient.quit();
        redisClient = null;
    }
}

export function buildApp(): express.Application {
    const app = express();
    app.use(json());

    // Handle graceful shutdown
    process.on('SIGTERM', cleanup);
    process.on('SIGINT', cleanup);

    app.post("/reset", async (req, res) => {
        try {
            const account = req.body.account ?? "account";
            await reset(account);
            console.log(`Successfully reset account ${account}`);
            res.sendStatus(204);
        } catch (e) {
            console.error("Error while resetting account", e);
            res.status(500).json({ error: String(e) });
        }
    });

    app.post("/charge", async (req, res) => {
        try {
            const account = req.body.account ?? "account";
            const result = await charge(account, req.body.charges ?? 10);
            console.log(`Successfully charged account ${account}`);
            res.status(200).json(result);
        } catch (e) {
            console.error("Error while charging account", e);
            res.status(500).json({ error: String(e) });
        }
    });

    return app;
}
