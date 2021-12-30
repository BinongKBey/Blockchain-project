module.exports.JsonToArray = function (json) {
    var size = Object.keys(json).length;
    var ret = new Uint8Array(size);
    for (var i = 0; i < size; i++) {
        ret[i] = json[i];
    }
    return ret
};