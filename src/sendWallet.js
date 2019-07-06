const Client = require('bitcore-wallet-client');


const fs = require('fs');
const BWS_INSTANCE_URL = 'https://bws.vpubchain.com/bws/api';
let address = 'PeqiRz3YqmdVjLQ9vd3ErmgswAQAWJEZSn';
let amount = 20000;
let note = 'the next test transaction';

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
        console.log('\n' + 'send money ===========================================================\n');
        client.createTxProposal({
            outputs: [{
                toAddress: address,
                amount: amount
            }],
            message: note
        }, function (err, txp) {
            if (err) {
                console.log('error: ', err);
                return;
            }
            console.log('txp: ', JSON.stringify(txp, "", "\t"));
            client.publishTxProposal({
                txp: txp
            }, function (err) {
                console.log(' * Tx created: ID %s [%s] RequiredSignatures:',
                    txp.id, txp.status, txp.requiredSignatures);
                console.log('\n' + 'proposals ===========================================================\n');
                client.getTxProposals({}, function (err, txps) {
                    console.log('tx proposals: ', txps);
                });
            });
        });
    });
});
	