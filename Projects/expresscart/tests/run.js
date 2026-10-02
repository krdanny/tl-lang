// Runs expressCart's own test suite (original/test/specs/*.js, ava + supertest, unchanged) against an implementation.
//   node tests/run.js original [spec]   the original JavaScript (original/)
//   node tests/run.js tl [spec]         the TL modules (tl/*.tl), compiled with tlc first
//
// The tests need a MongoDB server. Start one with Docker before running (the port is 27117 so that it does
// not collide with a MongoDB that may already listen on 27017):
//   docker run -d --name tl-bench-mongo-expresscart -p 27117:27017 mongo:7
// and remove it afterwards:
//   docker stop tl-bench-mongo-expresscart && docker rm tl-bench-mongo-expresscart
// Another server can be used by setting EXPRESSCART_MONGO (a MongoDB connection string). The app switches to the
// database `expresscart-test` by itself when NODE_ENV=test.
//
// How it works: original/ is copied to .run/<impl>/ (the app writes config/settings-local.json, uploads and
// similar files at run time, original/ stays untouched). For `tl`, the TL modules are compiled to .run/tl/_tl/
// and every converted source file of the copy is replaced by a one-line CommonJS shim that loads the compiled
// TL module, so the specs `require('../app.js')`, `require('../lib/common')`, ... exactly as they do upstream.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync, execFileSync } = require('node:child_process');

const which = process.argv[2] || 'original';
const only = process.argv[3];
const root = path.resolve(__dirname, '..');
const tree = path.join(root, '.run', which);
const mongo = process.env.EXPRESSCART_MONGO || 'mongodb://127.0.0.1:27117/expresscart';

// original source file -> TL module (tl/<name>.tl). The TL folder is flat, so routes/, lib/payments/ and
// lib/modules/ get a prefix. `main` is the single value of `module.exports = main` in the original file;
// without it the original exports an object of functions, which is the TL module's namespace.
const modules = {
    'app.js': { tl: 'app', main: 'app' },
    'routes/admin.js': { tl: 'routeAdmin', main: 'router' },
    'routes/customer.js': { tl: 'routeCustomer', main: 'router' },
    'routes/index.js': { tl: 'routeIndex', main: 'router' },
    'routes/order.js': { tl: 'routeOrder', main: 'router' },
    'routes/product.js': { tl: 'routeProduct', main: 'router' },
    'routes/reviews.js': { tl: 'routeReviews', main: 'router' },
    'routes/transactions.js': { tl: 'routeTransactions', main: 'router' },
    'routes/user.js': { tl: 'routeUser', main: 'router' },
    'lib/auth.js': { tl: 'auth' },
    'lib/cart.js': { tl: 'cart' },
    'lib/common.js': { tl: 'common' },
    'lib/config.js': { tl: 'config' },
    'lib/db.js': { tl: 'db' },
    'lib/googledata.js': { tl: 'googledata' },
    'lib/indexing.js': { tl: 'indexing' },
    'lib/menu.js': { tl: 'menu' },
    'lib/paginate.js': { tl: 'paginate' },
    'lib/payment-common.js': { tl: 'paymentCommon' },
    'lib/schema.js': { tl: 'schema' },
    'lib/testdata.js': { tl: 'testdata' },
    'lib/testhelper.js': { tl: 'testhelper' },
    'lib/modules/discount-voucher.js': { tl: 'modDiscountVoucher' },
    'lib/modules/reviews-basic.js': { tl: 'modReviewsBasic' },
    'lib/modules/shipping-basic.js': { tl: 'modShippingBasic' },
    'lib/payments/adyen.js': { tl: 'payAdyen', main: 'router' },
    'lib/payments/authorizenet.js': { tl: 'payAuthorizenet', main: 'router' },
    'lib/payments/blockonomics.js': { tl: 'payBlockonomics', main: 'router' },
    'lib/payments/instore.js': { tl: 'payInstore', main: 'router' },
    'lib/payments/paypal.js': { tl: 'payPaypal', main: 'router' },
    'lib/payments/payway.js': { tl: 'payPayway', main: 'router' },
    'lib/payments/stripe.js': { tl: 'payStripe', main: 'router' },
    'lib/payments/verifone.js': { tl: 'payVerifone', main: 'router' },
    'lib/payments/zip.js': { tl: 'payZip', main: 'router' }
};

fs.rmSync(tree, { recursive: true, force: true });
fs.mkdirSync(path.dirname(tree), { recursive: true });
fs.cpSync(path.join(root, 'original'), tree, { recursive: true });

if(which === 'tl'){
    try{
        execFileSync(process.execPath, [path.join(root, '../../lib/bin/tlc.js'), '--rootDir', 'tl', '--outDir', path.join(tree, '_tl')], { cwd: root, stdio: ['ignore', 'ignore', 'inherit'] });
    }catch(e){
        console.log('tlc failed');
        console.log('0 passed, 1 failed');
        process.exit(1);
    }
    for(const [file, m] of Object.entries(modules)){
        // a module that is not converted yet keeps its original source (used while converting module by module)
        if(!fs.existsSync(path.join(root, 'tl', `${m.tl}.tl`))){
            console.log(`not converted, original used: ${file}`);
            continue;
        }
        const rel = path.relative(path.dirname(path.join(tree, file)), path.join(tree, '_tl', `${m.tl}.js`)).split(path.sep).join('/');
        fs.writeFileSync(path.join(tree, file), `module.exports = require('${rel.startsWith('.') ? rel : `./${rel}`}')${m.main ? `.${m.main}` : ''};\n`);
    }
}else if(which !== 'original'){
    console.log(`unknown implementation '${which}' (original | tl)`);
    process.exit(2);
}

const args = ['--tap'];
if(only){ args.push(`test/specs/${only.replace(/\.js$/, '')}.js`); }
const r = spawnSync(path.join(root, 'node_modules/.bin/ava'), args, {
    cwd: tree,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    env: Object.assign({}, process.env, { NODE_ENV: 'test', databaseConnectionString: mongo })
});
const out = `${r.stdout || ''}`;
let pass = 0; let fail = 0;
for(const line of out.split('\n')){
    if(/^ok \d+ /.test(line)){ if(!/# SKIP/.test(line)){ pass++; } }else if(/^not ok \d+ /.test(line)){ fail++; }
}
// show the failures (TAP diagnostics) and anything the run printed to stderr when it did not end cleanly
if(fail || r.status !== 0){
    const lines = out.split('\n');
    for(let i = 0; i < lines.length; i++){
        if(/^not ok /.test(lines[i])){
            console.log(lines[i]);
            for(let j = i + 1; j < lines.length && /^\s/.test(lines[j]) && j < i + 30; j++){ console.log(lines[j]); }
        }
    }
    if(r.stderr){ console.log(r.stderr.split('\n').slice(-40).join('\n')); }
}
if(r.status !== 0 && fail === 0){ fail = 1; }
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
