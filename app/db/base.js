import AttributeError from './error';

class Base {
    constructor(db, clsname='V', parameters=['id']) {
        this.db = db;
        this.clsname = clsname;
        this.parameters = parameters;
    }
    get_by_id(id){
        return this.db.record.get(`#${id}`);
    }
    get(opt){
        const m = new Map();
        for (let key of this.parameters) {
            if (opt.hasOwnProperty(key)) {
                m.set(key, opt[key]);
            } else {
            }
        }
        for [key, value]
    }
}

export default Base;
