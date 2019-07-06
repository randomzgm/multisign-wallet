const Client = require('bitcore-wallet-client');


const fs = require('fs');
const BWS_INSTANCE_URL = 'http://localhost:3232/bws/api';

const client = new Client({
    baseUrl: BWS_INSTANCE_URL,
    verbose: false,
});

try {
    client.import(fs.readFileSync("../key/tomas.dat"));
} catch (e) {
    console.log("import error: ", e);
}

client.openWallet(function (err, ret) {
    if (err) {
        console.log('error: ', err);
        return;
    }
    console.log('wallet status: ', ret);
    console.log('\n' + 'balance ===========================================================\n');
    client.getBalance({}, function (err, res) {
        console.log('wallet balance: ', res);
        console.log('\n' + 'tx proposals ===========================================================\n');
        client.getTxProposals({}, function (err, txps) {
            if (!txps || txps.length === 0) {
                console.log('tx proposals is empty.');
                client.createAddress({}, function (err, x) {
                    if (err) {
                        console.log('error: ', err);
                        return;
                    }
                    console.log('* New Address %s ', x.address);
                })
            } else {
                console.log('tx proposals: ', JSON.stringify(txps, "", "\t"));
                console.log('\n' + 'sign ===========================================================\n');
                for (let i = 0; i < txps.length; i++) {
                    let tpDetail = txps[i];
                    client.signTxProposal(tpDetail, function (err, tx) {
                        if (err) {
                            if (err.message === 'Copayer already voted on this transaction proposal') {
                                console.log('transacion id: %s has signed by you before', tpDetail.id);
                            } else {
                                console.log('error: ', err);
                                return;
                            }
                        } else {
                            console.log('you sign a transaction id: ' + tpDetail.id);
                        }
                    });
                    if (tpDetail.status === 'accepted') {
                        client.broadcastTxProposal(tpDetail, function (err, txp) {
                            if (err) {
                                console.log('error: ', err);
                                return;
                            }
                            console.log('Transaction Broadcasted: TXID: ' + tpDetail.txid);
                        });
                    }
                }
            }
        });
    });
});
	