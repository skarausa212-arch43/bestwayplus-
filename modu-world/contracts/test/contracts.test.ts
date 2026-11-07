import { expect } from "chai";
import hre from "hardhat";
import { parseEther, getAddress, keccak256, toBytes } from "viem";

describe("ModuToken (testnet)", () => {
  async function deploy() {
    const [admin, alice, bob] = await hre.viem.getWalletClients();
    const token = await hre.viem.deployContract("ModuToken", [admin.account.address]);
    return { token, admin, alice, bob };
  }

  it("has the expected name, symbol and cap, and starts with zero supply (no pre-sale)", async () => {
    const { token } = await deploy();
    expect(await token.read.symbol()).to.equal("MODU");
    expect(await token.read.cap()).to.equal(parseEther("100000000"));
    expect(await token.read.totalSupply()).to.equal(0n);
  });

  it("only MINTER_ROLE can mint, and never beyond the cap", async () => {
    const { token, alice } = await deploy();
    await token.write.mint([alice.account.address, parseEther("10")]);
    expect(await token.read.balanceOf([alice.account.address])).to.equal(parseEther("10"));
    const asAlice = await hre.viem.getContractAt("ModuToken", token.address, { client: { wallet: alice } });
    await expect(asAlice.write.mint([alice.account.address, 1n])).to.be.rejectedWith("AccessControlUnauthorizedAccount");
    await expect(token.write.mint([alice.account.address, parseEther("100000000")])).to.be.rejectedWith("ERC20ExceededCap");
  });

  it("can be paused by the admin (incident response)", async () => {
    const { token, alice, bob } = await deploy();
    await token.write.mint([alice.account.address, 5n]);
    await token.write.pause();
    const asAlice = await hre.viem.getContractAt("ModuToken", token.address, { client: { wallet: alice } });
    await expect(asAlice.write.transfer([bob.account.address, 1n])).to.be.rejectedWith("EnforcedPause");
    await token.write.unpause();
    await asAlice.write.transfer([bob.account.address, 1n]);
    expect(await token.read.balanceOf([bob.account.address])).to.equal(1n);
  });

  it("has no payable functions (cannot receive ETH: no sale)", async () => {
    const { token, alice } = await deploy();
    await expect(alice.sendTransaction({ to: token.address, value: 1n })).to.be.rejected;
  });
});

describe("ModuCertificate (testnet)", () => {
  async function deploy() {
    const [admin, collector, other] = await hre.viem.getWalletClients();
    const cert = await hre.viem.deployContract("ModuCertificate", [admin.account.address, "https://modu.example/api/certificates/"]);
    return { cert, admin, collector, other };
  }

  it("mints a certificate with the public serial and a metadata URI", async () => {
    const { cert, collector } = await deploy();
    await cert.write.safeMint([collector.account.address, 1n, "MD-GEN-0001"]);
    expect(await cert.read.ownerOf([1n])).to.equal(getAddress(collector.account.address));
    expect(await cert.read.serialOf([1n])).to.equal("MD-GEN-0001");
    expect(await cert.read.tokenURI([1n])).to.equal("https://modu.example/api/certificates/1");
    expect(await cert.read.serialUsed([keccak256(toBytes("MD-GEN-0001"))])).to.equal(true);
  });

  it("refuses a second certificate for the same physical serial", async () => {
    const { cert, collector } = await deploy();
    await cert.write.safeMint([collector.account.address, 1n, "MD-GEN-0001"]);
    await expect(cert.write.safeMint([collector.account.address, 2n, "MD-GEN-0001"])).to.be.rejectedWith("SerialAlreadyCertified");
  });

  it("only MINTER_ROLE can mint", async () => {
    const { cert, other } = await deploy();
    const asOther = await hre.viem.getContractAt("ModuCertificate", cert.address, { client: { wallet: other } });
    await expect(asOther.write.safeMint([other.account.address, 9n, "X"])).to.be.rejectedWith("AccessControlUnauthorizedAccount");
  });
});
