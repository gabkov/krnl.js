"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BrowserProvider = void 0;
const index_js_1 = require("../utils/index.js");
const provider_jsonrpc_js_1 = require("./provider-jsonrpc.js");
const ethers_js_1 = require("../ethers.js");
;
/**
 *  A **BrowserProvider** is intended to wrap an injected provider which
 *  adheres to the [[link-eip-1193]] standard, which most (if not all)
 *  currently do.
 */
class BrowserProvider extends provider_jsonrpc_js_1.JsonRpcApiPollingProvider {
    #request;
    #krnlAccessToken;
    #provider;
    /**
     *  Connnect to the %%ethereum%% provider, optionally forcing the
     *  %%network%%.
     */
    constructor(ethereum, krnlAccessToken, network) {
        super(network, krnlAccessToken, { batchMaxCount: 1 });
        this.#request = async (method, params) => {
            const payload = { method, params };
            this.emit("debug", { action: "sendEip1193Request", payload });
            try {
                const result = await ethereum.request(payload);
                this.emit("debug", { action: "receiveEip1193Result", result });
                return result;
            }
            catch (e) {
                const error = new Error(e.message);
                error.code = e.code;
                error.data = e.data;
                error.payload = payload;
                this.emit("debug", { action: "receiveEip1193Error", error });
                throw error;
            }
        };
        if (krnlAccessToken) {
            this.#krnlAccessToken = krnlAccessToken;
            // TODO: setup the node url properly
            this.#provider = new ethers_js_1.JsonRpcProvider("http://127.0.0.1:8080", krnlAccessToken);
        }
        else {
            this.#krnlAccessToken = null;
            this.#provider = null;
        }
    }
    async send(method, params) {
        await this._start();
        return await super.send(method, params);
    }
    async _send(payload) {
        (0, index_js_1.assertArgument)(!Array.isArray(payload), "EIP-1193 does not support batch request", "payload", payload);
        try {
            const result = await this.#request(payload.method, payload.params || []);
            return [{ id: payload.id, result }];
        }
        catch (e) {
            return [{
                    id: payload.id,
                    error: { code: e.code, data: e.data, message: e.message }
                }];
        }
    }
    async sendKrnlTransactionRequest(messages) {
        if (!this.#krnlAccessToken || this.#krnlAccessToken == null) {
            throw (0, index_js_1.makeError)("Krnl access token not provided", "KRNL_ERROR");
        }
        return this.#provider.sendKrnlTransactionRequest(messages);
    }
    async getFaaSRequestsFromSnap() {
        const snapId = "npm:krnl-demo-snap";
        const snap = await this.getSnap(snapId, "0.1.1");
        // if not installed then install
        if (snap === undefined) {
            await this.#request('wallet_requestSnaps', { [snapId]: {} });
        }
        const res = await this.#request('wallet_invokeSnap', { snapId: snapId, request: { method: 'faas' } });
        // TODO: add validation
        return res.toUpperCase().split(" ");
    }
    /**
     * Get the installed snaps in MetaMask.
     *
     * @returns The snaps installed in MetaMask.
     */
    async getSnaps() {
        return (await this.#request('wallet_getSnaps', {}));
    }
    /* Get the snap from MetaMask.
    *
    * @param version - The version of the snap to install (optional).
    * @returns The snap object returned by the extension.
    */
    async getSnap(id, version) {
        try {
            const snaps = await this.getSnaps();
            return Object.values(snaps).find((snap) => snap.id === id && (!version || snap.version === version));
        }
        catch (error) {
            console.log('Failed to obtain installed snap', error);
            return undefined;
        }
    }
    ;
    getRpcError(payload, error) {
        error = JSON.parse(JSON.stringify(error));
        // EIP-1193 gives us some machine-readable error codes, so rewrite
        // them into 
        switch (error.error.code || -1) {
            case 4001:
                error.error.message = `ethers-user-denied: ${error.error.message}`;
                break;
            case 4200:
                error.error.message = `ethers-unsupported: ${error.error.message}`;
                break;
        }
        return super.getRpcError(payload, error);
    }
    /**
     *  Resolves to ``true`` if the provider manages the %%address%%.
     */
    async hasSigner(address) {
        if (address == null) {
            address = 0;
        }
        const accounts = await this.send("eth_accounts", []);
        if (typeof (address) === "number") {
            return (accounts.length > address);
        }
        address = address.toLowerCase();
        return accounts.filter((a) => (a.toLowerCase() === address)).length !== 0;
    }
    async getSigner(address) {
        if (address == null) {
            address = 0;
        }
        if (!(await this.hasSigner(address))) {
            try {
                //const resp = 
                await this.#request("eth_requestAccounts", []);
                //console.log("RESP", resp);
            }
            catch (error) {
                const payload = error.payload;
                throw this.getRpcError(payload, { id: payload.id, error });
            }
        }
        return await super.getSigner(address);
    }
}
exports.BrowserProvider = BrowserProvider;
//# sourceMappingURL=provider-browser.js.map