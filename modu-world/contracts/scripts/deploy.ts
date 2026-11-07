import hre from "hardhat";

/**
 * Deploys MODU (ERC-20) and MODU Certificate (ERC-721) to a TEST network.
 * Prints the env lines to paste into the web app's .env.
 */
async function main() {
  const chainId = hre.network.config.chainId ?? 31337;
  if (![11155111, 84532, 31337].includes(chainId)) throw new Error("Refusing to deploy outside known test networks");
  const [deployer] = await hre.viem.getWalletClients();
  const appUrl = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const token = await hre.viem.deployContract("ModuToken", [deployer.account.address]);
  const cert = await hre.viem.deployContract("ModuCertificate", [deployer.account.address, `${appUrl}/api/certificates/`]);
  console.log(`# network: ${hre.network.name} (${chainId})`);
  console.log(`WEB3_CHAIN_ID=${chainId}`);
  console.log(`MODU_TOKEN_ADDRESS=${token.address}`);
  console.log(`MODU_CERTIFICATE_ADDRESS=${cert.address}`);
  console.log(`# minter = deployer ${deployer.account.address}; set CERTIFICATE_MINTER_PRIVATE_KEY on the server only`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
