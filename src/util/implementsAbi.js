import EthjsAbi from "ethjs-abi";

export default (abi, bytecode) => {
  return abi.every(method => {
    const signature = EthjsAbi.encodeSignature(method).substring(2);
    return bytecode.indexOf(signature) >= 0;
  });
};
