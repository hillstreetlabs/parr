import Eth from "ethjs";

export default timestamp => {
  return new Date(timestamp.mul(new Eth.BN(1000)).toNumber(10)).toISOString();
};
