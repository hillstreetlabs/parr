import EthjsAbi from "ethjs-abi";

export default (abi, bytecode) => {
  const bytecodeIncludes = abi.map(method => {
    const signature = EthjsAbi.encodeSignature(method).substring(2);
    return bytecode.indexOf(signature) >= 0;
  });
  return bytecodeIncludes.every(bool => bool);
};
