const _ = require('lodash');
const url = require('url');
const read = require('read');
const log = require('npmlog');
const Client = require('bitcore-wallet-client');
const FileStorage = require('./fileStorage');
const sjcl = require('sjcl');
const moment = require('moment');

const WALLET_ENCRYPTION_OPTS = {
    iter: 5000
};

log.heading = '[' + moment().format('YYYY-MM-DD HH:mm:ss') + ']';
log.enableColor();
log.headingStyle = { fg: 'white'};
log.emitLog = function (m) {
    const self = this;
    if (self._paused) {
        self._buffer.push(m)
        return
    }
    if (self.progressEnabled) self.gauge.pulse(m.prefix)
    var l = self.levels[m.level]
    if (l === undefined) return
    if (l < self.levels[self.level]) return
    if (l > 0 && !isFinite(l)) return

    var style = log.style[m.level]
    var disp = log.disp[m.level] || m.level
    self.clearProgress()
    if (self.heading) {
        self.write(self.heading, self.headingStyle)
        self.write(' ')
    }
    self.write(disp, log.style[m.level])
    var p = m.prefix || ''
    if (p) self.write(' ')
    self.write(p, self.prefixStyle)
    self.write(' ' + m.message + '\n')
    self.showProgress()
}

const Utils = function () {
};

Utils.log = log;

const die = Utils.die = function (err) {
    if (err) {
        if (err.code && err.code === 'ECONNREFUSED') {
            console.error('!! Could not connect to Bicore Wallet Service');
        } else {
            console.log('!! ' + err.toString());
        }
        process.exit(1);
    }
};

Utils.parseMN = function(text) {
    if (!text) throw new Error('No m-n parameter');

    const regex = /^(\d+)(-|of|-of-)?(\d+)$/i;
    const match = regex.exec(text.trim());

    if (!match || match.length === 0) throw new Error('Invalid m-n parameter');

    const m = parseInt(match[1]);
    const n = parseInt(match[3]);
    if (m > n) throw new Error('Invalid m-n parameter');

    return [m, n];
};


Utils.shortID = function(id) {
    return id.substr(id.length - 4);
};

Utils.confirmationId = function(copayer) {
    return parseInt(copayer.xPubKeySignature.substr(-4), 16).toString().substr(-4);
}


Utils.doLoad = function(client, doNotComplete, walletData, password, filename, cb) {
    if (password) {
        try {
            walletData = sjcl.decrypt(password, walletData);
        } catch (e) {
            die('Could not open wallet. Wrong password.');
        }
    }

    try {
        client.import(walletData);
    } catch (e) {
        die('Corrupt wallet file.');
    };
    if (doNotComplete) return cb(client);


    client.on('walletCompleted', function(wallet) {
        Utils.doSave(client, filename, password, function() {
            log.info('Your wallet has just been completed. Please backup your wallet file or use the export command.');
        });
    });
    client.openWallet(function(err, isComplete) {
        if (err) throw err;

        return cb(client);
    });
};

Utils.loadEncrypted = function(client, opts, walletData, filename, cb) {
    read({
        prompt: 'Enter password to decrypt:',
        silent: true
    }, function(er, password) {
        if (er) die(err);
        if (!password) die("no password given");

        return Utils.doLoad(client, opts.doNotComplete, walletData, password, filename, cb);
    });
};

Utils.getClient = function(args, opts, cb) {
    opts = opts || {};

    const filename = args.file || process.env['WALLET_FILE'] || process.env['HOME'] + '/.wallet.dat';
    const host = args.host || process.env['BWS_HOST'] || 'https://bws.bitpay.com/';
    log.info('Bitcore Wallet Service host is $s', host);

    const storage = new FileStorage({
        filename: filename,
    });

    const client = new Client({
        baseUrl: url.resolve(host, '/bws/api'),
        verbose: args.verbose,
        supportStaffWalletId: opts.walletId,
        timeout: 20 * 60 * 1000,
        //timeout: 1000,
    });

    storage.load(function(err, walletData) {
        if (err) {
            if (err.code === 'ENOENT') {
                if (opts.mustExist) {
                    die('File "' + filename + '" not found.');
                }
            } else {
                die(err);
            }
        }

        if (walletData && opts.mustBeNew) {
            die('File "' + filename + '" already exists.');
        }
        if (!walletData) return cb(client);

        let json;
        try {
            json = JSON.parse(walletData);
        } catch (e) {
            die('Invalid input file');
        };

        if (json.ct) {
            Utils.loadEncrypted(client, opts, walletData, filename, cb);
        } else {
            Utils.doLoad(client, opts.doNotComplete, walletData, null, filename, cb);
        }
    });
};

Utils.doSave = function(client, filename, password, cb) {
    const opts = {};

    let str = client.export();
    if (password) {
        str = sjcl.encrypt(password, str, WALLET_ENCRYPTION_OPTS);
    }

    const storage = new FileStorage({
        filename: filename,
    });

    storage.save(str, function(err) {
        die(err);
        return cb();
    });
};

Utils.saveEncrypted = function(client, filename, cb) {
    read({
        prompt: 'Enter password to encrypt:',
        silent: true
    }, function(er, password) {
        if (er) Utils.die(err);
        if (!password) Utils.die("no password given");
        read({
            prompt: 'Confirm password:',
            silent: true
        }, function(er, password2) {
            if (er) Utils.die(err);
            if (password != password2)
                Utils.die("passwords were not equal");

            Utils.doSave(client, filename, password, cb);
        });
    });
};

Utils.saveClient = function(args, client, opts, cb) {
    if (_.isFunction(opts)) {
        cb = opts;
        opts = {};
    }

    const filename = args.file || process.env['WALLET_FILE'] || process.env['HOME'] + '/.wallet.dat';

    const storage = new FileStorage({
        filename: filename,
    });

    console.log(' * Saving file', filename);

    storage.exists(function(exists) {
        if (exists && opts.doNotOverwrite) {
            console.log(' * File already exists! Please specify a new filename using the -f option.');
            return cb();
        }

        if (args.password) {
            Utils.saveEncrypted(client, filename, cb);
        } else {
            Utils.doSave(client, filename, null, cb);
        };
    });
};

Utils.findOneTxProposal = function(txps, id) {
    const matches = _.filter(txps, function (tx) {
        return _.endsWith(Utils.shortID(tx.id), id);
    });

    if (!matches.length)
        Utils.die('Could not find TX Proposal:' + id);

    if (matches.length > 1) {
        console.log('More than one TX Proposals match:' + id);
        Utils.renderTxProposals(txps);
        process.exit(1);
    }

    return matches[0];
};

Utils.UNITS2 = {
    'btc': 100000000,
    'bit': 100,
    'sat': 1,
};

Utils.parseAmount = function(text) {
    if (!_.isString(text))
        text = text.toString();

    const regex = '^(\\d*(\\.\\d{0,8})?)\\s*(' + _.keys(Utils.UNITS2).join('|') + ')?$';
    const match = new RegExp(regex, 'i').exec(text.trim());

    if (!match || match.length === 0) {
        Utils.die('Invalid amount: ' + text);
    }

    const amount = parseFloat(match[1]);
    if (!_.isNumber(amount) || _.isNaN(amount)) throw new Error('Invalid amount');

    const unit = (match[3] || 'sat').toLowerCase();
    const rate = Utils.UNITS2[unit];
    if (!rate) {
        Utils.die('Invalid unit: ' + unit);
    }

    const amountSat = parseFloat((amount * rate).toPrecision(12));
    if (amountSat != Math.round(amountSat)) {
        Utils.die('Invalid amount: ' + amount + ' ' + unit);
    }

    return amountSat;
};

Utils.configureCommander = function(program) {
    program
        .version('0.0.1')
        .option('-f, --file <filename>', 'Wallet file')
        .option('-h, --host <host>', 'Bitcore Wallet Service URL (eg: http://localhost:3001/copay/api')
        .option('-v, --verbose', 'be verbose')

    return program;
};

Utils.COIN = {
    bch: {
        name: 'bch',
        toSatoshis: 100000000,
        maxDecimals: 8,
        minDecimals: 8,
    },
    btc: {
        name: 'btc',
        toSatoshis: 100000000,
        maxDecimals: 8,
        minDecimals: 8,
    },
    bit: {
        name: 'bit',
        toSatoshis: 100,
        maxDecimals: 2,
        minDecimals: 2,
    },
    part: {
        name: 'part',
        toSatoshis: 100000000,
        maxDecimals: 8,
        minDecimals: 8
    }
};

Utils.renderAmount = function(satoshis, coin, opts) {
    function clipDecimals(number, decimals) {
        const x = number.toString().split('.');
        const d = (x[1] || '0').substring(0, decimals);
        return parseFloat(x[0] + '.' + d);
    };

    function addSeparators(nStr, thousands, decimal, minDecimals) {
        nStr = nStr.replace('.', decimal);
        const x = nStr.split(decimal);
        let x0 = x[0];
        let x1 = x[1];

        x1 = _.dropRightWhile(x1, function(n, i) {
            return n === '0' && i >= minDecimals;
        }).join('');
        const x2 = x.length > 1 ? decimal + x1 : '';

        x0 = x0.replace(/\B(?=(\d{3})+(?!\d))/g, thousands);
        return x0 + x2;
    };

    opts = opts || {};

    const myCoin = coin || 'btc';
    const u = Utils.COIN[myCoin] || Utils.COIN.btc;
    const amount = clipDecimals((satoshis / u.toSatoshis), u.maxDecimals).toFixed(u.maxDecimals);
    return addSeparators(amount, opts.thousandsSeparator || ',', opts.decimalSeparator || '.', u.minDecimals) + ' ' + u.name;
};

Utils.renderTxProposals = function(txps) {
    if (_.isEmpty(txps))
        return;

    console.log("* TX Proposals:")

    _.each(txps, function(x) {
        var missingSignatures = x.requiredSignatures - _.filter(_.values(x.actions), function(a) {
            return a.type === 'accept';
        }).length;
        console.log("\t%s [\"%s\" by %s] %s => %s", Utils.shortID(x.id), x.message, x.creatorName, Utils.renderAmount(x.amount), x.outputs[0].toAddress);

        if (!_.isEmpty(x.actions)) {
            console.log('\t\tActions: ', _.map(x.actions, function(a) {
                return a.copayerName + ' ' + (a.type === 'accept' ? '✓' : '✗') + (a.comment ? ' (' + a.comment + ')' : '');
            }).join('. '));
        }
        if (missingSignatures > 0) {
            console.log('\t\tMissing signatures: ' + missingSignatures);
        } else {
            console.log('\t\tReady to broadcast');
        }
    });

};

module.exports = Utils;