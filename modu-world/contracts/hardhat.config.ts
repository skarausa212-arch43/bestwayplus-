import { subtask, type HardhatUserConfig } from "hardhat/config";
import { TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD } from "hardhat/builtin-tasks/task-names";
import "@nomicfoundation/hardhat-toolbox-viem";
import path from "node:path";

const SOLC = "0.8.28";

// Use the solc-js compiler from node_modules instead of downloading one
// (works offline and in restricted CI networks).
subtask(TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD, async (args: { solcVersion: string }, _hre, runSuper) => {
  if (args.solcVersion === SOLC) {
    return {
      compilerPath: path.join(__dirname, "node_modules", "solc", "soljson.js"),
      isSolcJs: true,
      version: SOLC,
      longVersion: require("solc").version().replace(".Emscripten.clang", ""),
    };
  }
  return runSuper();
});

const config: HardhatUserConfig = {
  solidity: { version: SOLC, settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: "cancun" } },
  networks: {
    // Testnet only. The deployer key lives in the environment, never in the repo or the web app.
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL ?? "",
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [],
      chainId: 11155111,
    },
  },
};

export default config;
