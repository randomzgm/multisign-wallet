const utils = require('./clientUtil');
const fs = require('fs');

const KEY_PATH = '../key';

utils.getClient({}, {doNotComplete: true}, function (client) {
    const walletName = "multi sign Wallet";
    const creator = "Random";
    const passphrase = "random is a coder";
    const network = 'testnet';
    const coin = 'part';

    client.seedFromRandomWithMnemonic({
        network: network,
        passphrase: passphrase,
        language: 'en',
        coin: coin,
    });

    client.createWallet(walletName, creator, 2, 2, {coin: coin, network: network}, function (err, secret) {
        utils.die(err);
        utils.log.info('Wallet Created. Share this secret with your copayers: ' + secret);
        if (!fs.existsSync(KEY_PATH)) {
            fs.mkdirSync(KEY_PATH);
        }
        fs.writeFileSync(`${KEY_PATH}/main.dat`, client.export());

        // join wallet
        utils.log.info('let us join wallet');
        utils.getClient({}, {doNotComplete: true}, function (joinClient) {
            joinClient.joinWallet(secret, "Tomas", {coin: coin}, function (err, wallet) {
                utils.die(err);

                utils.log.info('Joined ' + wallet.name + '!');
                fs.writeFileSync(`${KEY_PATH}/tomas.dat`, joinClient.export());


                joinClient.openWallet(function (err, ret) {
                    utils.die(err);
                    utils.log.info('Wallet Info:\n', JSON.stringify(ret, null, '\t'));

                    utils.log.info('Creating first address:\n', JSON.stringify(ret, null, "\t"));
                    if (ret.wallet.status === 'complete') {
                        joinClient.createAddress({}, function (err, addr) {
                            utils.die(err);
                            utils.log.info('Return address:\n', JSON.stringify(addr, null, "\t"));
                        });
                    }
                });
            });
        });
    });
});
