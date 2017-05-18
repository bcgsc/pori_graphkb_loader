'use strict';
const {Base, KBVertex} = require('./base');
const Promise = require('bluebird');


class Event extends Base {
    
    static createClass(db) {
        const props = [
            {name: 'zygosity', type: 'string', mandatory: false},
            {name: 'type', type: 'string', mandatory: true, notNull: true}
        ];
        return new Promise((resolve, reject) => {
            super.createClass({db, clsname: this.clsname, superClasses: KBVertex.clsname, isAbstract: true, properties: props})
                .then(() => {
                    return this.loadClass(db);
                }).then((cls) => {
                    resolve(cls);
                }).catch((error) => {
                    reject(error);
                });
        });
    }
}


class CategoryEvent extends Base {

    static createClass(db) {
        const props = [
            {name: 'term', type: 'string', mandatory: true, notNull: true}
        ];
        return new Promise((resolve, reject) => {
            super.createClass({db, clsname: this.clsname, superClasses: Event.clsname, isAbstract: false, properties: props})
                .then(() => {
                    return this.loadClass(db);
                }).then((cls) => {
                    resolve(cls);
                }).catch((error) => {
                    reject(error);
                });
        });
    }
}


class PositionalEvent extends Base {
    validateContent(content) {
        const args = Object.assign({}, content);

        return super.validateContent(args);
    }
    static createClass(db) {
        const props = [
            {name: 'start', type: 'link', mandatory: true, notNull: true, linkedClass: Position.clsname},
            {name: 'end', type: 'link', mandatory: true, notNull: true, linkedClass: Position.clsname},
            {name: 'untemplated_seq', type: 'string', mandatory: false, notNull: true},
            {name: 'reference_seq', type: 'string', mandatory: false, notNull: true}
            {name: 'subtype', type: 'string', mandatory: false}
        ];
        return new Promise((resolve, reject) => {
            super.createClass({db, clsname: this.clsname, superClasses: Event.clsname, isAbstract: false, properties: props})
                .then(() => {
                    return this.loadClass(db);
                }).then((cls) => {
                    resolve(cls);
                }).catch((error) => {
                    reject(error);
                });
        });
    }
}
