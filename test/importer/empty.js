const {
    expect
} = require('chai');
const uuidV4 = require('uuid/v4');
const path = require('path');
const jwt = require('jsonwebtoken');

const {
    setUpEmptyDB, clearDB
} = require('./../util');
const createConfig = require('./../../config/config.js');
const {generateToken} = require('./../../app/routes/auth');

const ensembl = require('./../../importer/ensembl');
const refseq = require('./../../importer/refseq');
const fda = require('./../../importer/fda');
const oncotree = require('./../../importer/oncotree');
const vario = require('./../../importer/vario');
const drugbank = require('./../../importer/drugbank');

const {ApiConnection} = require('./../../importer/util');


const REALLY_LONG_TIME = 10000000000;

const DATA_DIR = path.join(__dirname, './../data');

const ENSEMBL_INPUT = path.join(DATA_DIR, 'ensembl_20181102_biomart_export_kras.tab');
const REFSEQ_INPUT = path.join(DATA_DIR, 'LRG_RefSeqGene_d1541209245_kras.tab');
const FDA_INPUT = path.join(DATA_DIR, 'UNII_Records_25Oct2018_sample.txt');
const ONCOTREE_TUMOUR_TYPES = path.join(DATA_DIR, 'tumorTypes-oncotree_latest_stable.json');
const VARIO_INPUT = path.join(DATA_DIR, 'vario_v2018-04-27.owl');
const DRUGBANK_INPUT = path.join(DATA_DIR, 'drugbank_sample.xml');


describe('importers', () => {
    let db,
        admin,
        app,
        mockToken,
        server,
        connection,
        conf;
    before(async () => {
        ({
            db,
            admin,
            server,
            conf
        } = await setUpEmptyDB({
            ...createConfig(),
            disableAuth: true,
            privateKey: 'testKey'
        }));

        const {AppServer} = require('./../../app'); // eslint-disable-line global-require
        delete conf.app.port;
        conf.db.create = false; // already created above
        app = new AppServer(conf);

        await app.listen();
        mockToken = await generateToken(db, admin.name, conf.privateKey, REALLY_LONG_TIME);
        const {exp} = jwt.decode(mockToken);

        connection = new ApiConnection(`http://${app.host}:${app.port}/api`);
        connection.headers.Authorization = mockToken;
        connection.exp = exp;
    });
    describe('loads input files', () => {
        describe('ensembl', () => {
            const sourceName = 'ensembl';
            before(async () => {
                await ensembl.uploadFile({
                    filename: ENSEMBL_INPUT,
                    conn: connection
                });
            });
            it('creates a source', async () => {
                // check that there is a source named ensembl
                const sources = await db.query(`select * from source where name = '${sourceName}'`);
                expect(sources).to.have.property('length', 1);
            });
            it('creates genes', async () => {
                const genes = await db.query(`select * from feature where biotype = 'gene' and source.name = '${sourceName}'`);
                expect(genes).to.have.property('length', 2); // general and versioned
            });
            it('creates transcripts', async () => {
                const transcripts = await db.query(`select * from feature where biotype = 'transcript' and source.name = '${sourceName}'`);
                expect(transcripts).to.have.property('length', 8);
            });
            after(async () => {
                await clearDB(db, admin);
            });
        });
        describe('refseq', () => {
            const sourceName = 'refseq';
            before(async () => {
                await refseq.uploadFile({
                    filename: REFSEQ_INPUT,
                    conn: connection
                });
            });
            it('creates a source', async () => {
                // check that there is a source named ensembl
                const sources = await db.query(`select * from source where name = '${sourceName}'`);
                expect(sources).to.have.property('length', 1);
            });
            it('creates no genes', async () => {
                // check that the correct number of elements have been created
                const genes = await db.query(`select * from feature where biotype = 'gene' and source.name = '${sourceName}'`);
                expect(genes).to.have.property('length', 0);
            });
            it('creates transcripts', async () => {
                const transcripts = await db.query(`select * from feature where biotype = 'transcript' and source.name = '${sourceName}'`);
                expect(transcripts).to.have.property('length', 4);
            });
            it('creates proteins', async () => {
                const proteins = await db.query(`select * from feature where biotype = 'protein' and source.name = '${sourceName}'`);
                expect(proteins).to.have.property('length', 4);
            });
            after(async () => {
                await clearDB(db, admin);
            });
        });
        describe('fda', () => {
            const sourceName = 'fda';
            before(async () => {
                await fda.uploadFile({
                    filename: FDA_INPUT,
                    conn: connection
                });
            });
            it('creates a source', async () => {
                // check that there is a source named ensembl
                const sources = await db.query(`select * from source where name = '${sourceName}'`);
                expect(sources).to.have.property('length', 1);
            });
            it('creates therapies', async () => {
                // check that the correct number of elements have been created
                const drugs = await db.query(`select * from therapy where source.name = '${sourceName}'`);
                expect(drugs).to.have.property('length', 4);
            });
            after(async () => {
                await clearDB(db, admin);
            });
        });
        describe('oncotree', () => {
            const sourceName = 'oncotree';
            before(async () => {
                // mock the oncotree api class
                const versions = [
                    {name: '2018-01-01', apiKey: 'latest'}
                ];

                const data = require(ONCOTREE_TUMOUR_TYPES);  // eslint-disable-line
                oncotree.OncotreeAPI.prototype.getRecords = async () => data;
                oncotree.OncotreeAPI.prototype.getVersions = async () => versions;

                await oncotree.upload({
                    conn: connection
                });
            });
            it('creates a source', async () => {
                // check that there is a source named ensembl
                const sources = await db.query(`select * from source where name = '${sourceName}'`);
                expect(sources).to.have.property('length', 1);
            });
            it('creates diseases', async () => {
                // check that the correct number of elements have been created
                const diseases = await db.query(`select * from disease where source.name = '${sourceName}'`);
                expect(diseases).to.have.property('length', 853);
            });
            after(async () => {
                await clearDB(db, admin);
            });
        });
        describe('vario', () => {
            const sourceName = 'vario';
            before(async () => {
                await vario.uploadFile({
                    filename: VARIO_INPUT,
                    conn: connection
                });
            });
            it('creates a source', async () => {
                // check that there is a source named ensembl
                const sources = await db.query(`select * from source where name = '${sourceName}'`);
                expect(sources).to.have.property('length', 1);
            });
            it('creates vocabulary terms', async () => {
                // check that the correct number of elements have been created
                const drugs = await db.query(`select * from vocabulary where source.name = '${sourceName}'`);
                expect(drugs).to.have.property('length', 447);
            });
            after(async () => {
                await clearDB(db, admin);
            });
        });
        describe('drugbank', () => {
            const sourceName = 'drugbank';
            before(async () => {
                await drugbank.uploadFile({
                    filename: DRUGBANK_INPUT,
                    conn: connection
                });
            });
            it('creates a source', async () => {
                // check that there is a source named ensembl
                const sources = await db.query(`select * from source where name = '${sourceName}'`);
                expect(sources).to.have.property('length', 1);
            });
            it('creates vocabulary terms', async () => {
                // check that the correct number of elements have been created
                const drugs = await db.query(`select * from therapy where source.name = '${sourceName}'`);
                expect(drugs).to.have.property('length', 5);
            });
            after(async () => {
                await clearDB(db, admin);
            });
        });
    });

    after(async () => {
        if (server) {
            if (db && conf.db.create) {
                await server.drop({name: conf.db.name});
            }
            await server.close();
        }
    });
});
