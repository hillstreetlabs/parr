import EthjsAbi from "ethjs-abi";

export const abiToSignatures = abi => {
  return abi.map(method => EthjsAbi.encodeSignature(method).substring(2));
};

export default (abi, bytecode) => {
  return abiToSignatures(abi).every(signature => {
    return bytecode.indexOf(signature) >= 0;
  });
};
