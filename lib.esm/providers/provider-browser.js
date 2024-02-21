import { assertArgument, makeError } from "../utils/index.js";
import { JsonRpcApiPollingProvider } from "./provider-jsonrpc.js";
import { JsonRpcProvider } from "../ethers.js";
;
/**
 *  A **BrowserProvider** is intended to wrap an injected provider which
 *  adheres to the [[link-eip-1193]] standard, which most (if not all)
 *  currently do.
 */
export class BrowserProvider extends JsonRpcApiPollingProvider {
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
            this.#provider = new JsonRpcProvider("http://127.0.0.1:8080", krnlAccessToken);
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
        assertArgument(!Array.isArray(payload), "EIP-1193 does not support batch request", "payload", payload);
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
            throw makeError("Krnl access token not provided", "KRNL_ERROR");
        }
        return this.#provider.sendKrnlTransactionRequest(messages);
    }
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
//# sourceMappingURL=provider-browser.js.map