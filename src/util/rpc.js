import fetch from "isomorphic-fetch";

export default async function rpc(endpoint, method, params) {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: new Headers({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: method,
      params: params
    })
  });
  return res.json();
}
