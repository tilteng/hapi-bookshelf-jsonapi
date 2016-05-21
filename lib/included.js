'use strict';

class Included {
  constructor() {
    this.included = {};
  }

  push(data) {
    this.included[data.type] = this.included[data.type] || {};
    this.included[data.type][data.id] = data;
  }

  toJSON() {
    const ret = [];
    Object.keys(this.included).forEach(function (type) {
      Object.keys(this.included[type]).forEach(function (id) {
        ret.push(this.included[type][id]);
      }, this);
    }, this);
    return ret;
  }
}

module.exports = Included;
