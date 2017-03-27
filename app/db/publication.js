import AttributeError from './error';
import Base from './base';

class Publication extends Base {
    get(opt){
        if (opt.id !== undefined) {
            return this.get_by_id(opt.id);
        } else {
        }
    }
};

export default Publication;
