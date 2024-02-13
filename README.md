# krnl.js

[![npm (tag)](https://img.shields.io/npm/v/krnl)](https://www.npmjs.com/package/krnl)
![npm (downloads)](https://img.shields.io/npm/dm/krnl)

---

Forked from [ethers.js 6.10.1](https://github.com/ethers-io/ethers.js/tree/v6.10.0)and extended with krnl specific rpc calls and configs.

## Installing

**NodeJS**

```
npm install krnl
```

**Browser (ESM)**

The bundled library is available in the `./dist/` folder in this repo.

```
<script type="module">
    import { ethers } from "./dist/ethers.min.js";
</script>
```

## Changelog

For the latest changes, see the
[CHANGELOG](https://github.com/gabkov/krnl.js/blob/main/CHANGELOG.md).

## Original ethers documentation

Browse the [documentation](https://docs.ethers.org) online:

- [Getting Started](https://docs.ethers.org/v6/getting-started/)
- [Full API Documentation](https://docs.ethers.org/v6/api/)
- [Various Ethereum Articles](https://blog.ricmoo.com/)

## Usage
_Note: Metamask connection is currently not supported._

### Setting up your krnl json rpc provider

```javascript
const provider = new ethers.JsonRpcProvider(KRNL_NODE, krnlAccessToken);
```

### Sending krnl transaction requests and calling contracts

```javascript
// specify the FaaS you need
const faasRequests: string[] = ["KYT", "KYC"];
// requesting the signatureToken
const hashAndSig = await provider.sendKrnlTransactionRequest(faasRequests);
// call your contract
const sentTx = await dapp.protectedFunctionality(
  "test",
  hashAndSig.hash,
  hashAndSig.signatureToken,
  { messages: faasRequests }
);
```

For more example see the sandbox [example scripts](https://github.com/gabkov/krnl-sandbox/tree/main/example-dapp/scripts).
