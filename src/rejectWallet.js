const Client = require('bitcore-wallet-client');

const fs = require('fs');
const BWS_INSTANCE_URL = 'https://bws.vpubchain.com/bws/api';

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
                return;
            }
            console.log('tx proposals: ', JSON.stringify(txps, "", "\t"));
            console.log('\n' + 'reject ===========================================================\n');
            for (var i = 0; i < txps.length; i++) {
                var tpDetail = txps[i];
                client.rejectTxProposal(tpDetail, 'test reject', function (err, tx) {
                    if (err) {
                        if (err.message === 'Copayer already voted on this transaction proposal') {
                            console.log('transacion id: %s has signed by you before', tpDetail.id);
                        } else {
                            console.log('error: ', err);
                            return;
                        }
                    } else {
                        console.log('you reject a transaction id: ' + tpDetail.id);
                    }
                });
            }
        });
    });
});
	