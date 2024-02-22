import { assertArgument, makeError } from "../utils/index.js";

import { JsonRpcApiPollingProvider } from "./provider-jsonrpc.js";

import type {
    JsonRpcError, JsonRpcPayload, JsonRpcResult,
    JsonRpcSigner
} from "./provider-jsonrpc.js";
import type { Networkish } from "./network.js";
import { KrnlTxRequestResponse } from "./provider.js";
import { JsonRpcProvider } from "../ethers.js";

/**
 *  The interface to an [[link-eip-1193]] provider, which is a standard
 *  used by most injected providers, which the [[BrowserProvider]] accepts
 *  and exposes the API of.
 */
export interface Eip1193Provider {
    /**
     *  See [[link-eip-1193]] for details on this method.
     */
    request(request: { method: string, params?: Array<any> | Record<string, any> }): Promise<any>;
};

/**
 *  The possible additional events dispatched when using the ``"debug"``
 *  event on a [[BrowserProvider]].
 */
export type DebugEventBrowserProvider = {
    action: "sendEip1193Payload",
    payload: { method: string, params: Array<any> }
} | {
    action: "receiveEip1193Result",
    result: any
} | {
    action: "receiveEip1193Error",
    error: Error
};

export type GetSnapsResponse = Record<string, Snap>;

export type Snap = {
  permissionName: string;
  id: string;
  version: string;
  initialPermissions: Record<string, unknown>;
};


/**
 *  A **BrowserProvider** is intended to wrap an injected provider which
 *  adheres to the [[link-eip-1193]] standard, which most (if not all)
 *  currently do.
 */
export class BrowserProvider extends JsonRpcApiPollingProvider {
    #request: (method: string, params: Array<any> | Record<string, any>) => Promise<any>;

    #krnlAccessToken: null | string;
    #provider: null | JsonRpcProvider;

    /**
     *  Connnect to the %%ethereum%% provider, optionally forcing the
     *  %%network%%.
     */
    constructor(ethereum: Eip1193Provider, krnlAccessToken?: null | string, network?: Networkish) {
        super(network, krnlAccessToken, { batchMaxCount: 1 });

        this.#request = async (method: string, params: Array<any> | Record<string, any>) => {
            const payload = { method, params };
            this.emit("debug", { action: "sendEip1193Request", payload });
            try {
                const result = await ethereum.request(payload);
                this.emit("debug", { action: "receiveEip1193Result", result });
                return result;
            } catch (e: any) {
                const error = new Error(e.message);
                (<any>error).code = e.code;
                (<any>error).data = e.data;
                (<any>error).payload = payload;
                this.emit("debug", { action: "receiveEip1193Error", error });
                throw error;
            }
        };

        if(krnlAccessToken){
            this.#krnlAccessToken = krnlAccessToken;
            // TODO: setup the node url properly
            this.#provider = new JsonRpcProvider("http://127.0.0.1:8080", krnlAccessToken);
        }else{
            this.#krnlAccessToken = null;
            this.#provider = null;
        }
        
    }

    async send(method: string, params: Array<any> | Record<string, any>): Promise<any> {
        await this._start();

        return await super.send(method, params);
    }

    async _send(payload: JsonRpcPayload | Array<JsonRpcPayload>): Promise<Array<JsonRpcResult | JsonRpcError>> {
        assertArgument(!Array.isArray(payload), "EIP-1193 does not support batch request", "payload", payload);

        try {
            const result = await this.#request(payload.method, payload.params || [ ]);
            return [ { id: payload.id, result } ];
        } catch (e: any) {
            return [ {
                id: payload.id,
                error: { code: e.code, data: e.data, message: e.message }
            } ];
        }
    }

    async sendKrnlTransactionRequest(messages: string[]): Promise<KrnlTxRequestResponse> {
        if(!this.#krnlAccessToken || this.#krnlAccessToken == null){
            throw makeError("Krnl access token not provided", "KRNL_ERROR");
        }
        
        return this.#provider!.sendKrnlTransactionRequest(messages)
    }

    async getFaaSRequestsFromSnap(): Promise<string[]>{
        const snapId = "npm:krnl-demo-snap"
        const snap = await this.getSnap(snapId, "0.1.1");
        
        // if not installed then install
        if(snap === undefined){
            await this.#request('wallet_requestSnaps', {[snapId]: {}});
        }

        const res = await this.#request(
          'wallet_invokeSnap',
          { snapId: snapId, request: { method: 'faas' } },
        );

        // TODO: add validation
        return res.toUpperCase().split(" ")
    }
        
    /**
     * Get the installed snaps in MetaMask.
     *
     * @returns The snaps installed in MetaMask.
     */
    async getSnaps(): Promise<GetSnapsResponse> {
        return (await this.#request('wallet_getSnaps', {})) as unknown as GetSnapsResponse;
    }


    /* Get the snap from MetaMask.
    *
    * @param version - The version of the snap to install (optional).
    * @returns The snap object returned by the extension.
    */
    async getSnap(id: string, version?: string): Promise<Snap | undefined> {
        try {
            const snaps = await this.getSnaps();

            return Object.values(snaps).find(
                (snap) =>
                    snap.id === id && (!version || snap.version === version),
            );
        } catch (error) {
            console.log('Failed to obtain installed snap', error);
            return undefined;
        }
    };

    getRpcError(payload: JsonRpcPayload, error: JsonRpcError): Error {

        error = JSON.parse(JSON.stringify(error));

        // EIP-1193 gives us some machine-readable error codes, so rewrite
        // them into 
        switch (error.error.code || -1) {
            case 4001:
                error.error.message = `ethers-user-denied: ${ error.error.message }`;
                break;
            case 4200:
                error.error.message = `ethers-unsupported: ${ error.error.message }`;
                break;
        }

        return super.getRpcError(payload, error);
    }

    /**
     *  Resolves to ``true`` if the provider manages the %%address%%.
     */
    async hasSigner(address: number | string): Promise<boolean> {
        if (address == null) { address = 0; }

        const accounts = await this.send("eth_accounts", [ ]);
        if (typeof(address) === "number") {
            return (accounts.length > address);
        }

        address = address.toLowerCase();
        return accounts.filter((a: string) => (a.toLowerCase() === address)).length !== 0;
    }

    async getSigner(address?: number | string): Promise<JsonRpcSigner> {
        if (address == null) { address = 0; }

        if (!(await this.hasSigner(address))) {
            try {
                //const resp = 
                await this.#request("eth_requestAccounts", [ ]);
                //console.log("RESP", resp);

            } catch (error: any) {
                const payload = error.payload;
                throw this.getRpcError(payload, { id: payload.id, error });
            }
        }

        return await super.getSigner(address);
    }
}
