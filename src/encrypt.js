const nacl = require('tweetnacl');
const { JsonToArray } = require('./JsonToArray');
nacl.util = require('tweetnacl-util');

module.exports.encryptText = function (server, user, plain_text, one_time_code) {
    //Get the cipher text
    const cipher_text = nacl.box(
        nacl.util.decodeUTF8(plain_text),
        one_time_code,
        user.publicKey,
        server.secretKey
    );

    //message to be sent to Viktoria
    const message_in_transit = { cipher_text, one_time_code };

    return JSON.stringify(message_in_transit);
}

module.exports.decryptText = function (ser, usr, msg) {
    //Get the decoded message
    let m = JSON.parse(msg)
    let message = {
        one_time_code: JsonToArray(m.one_time_code),
        cipher_text: JsonToArray(m.cipher_text)
    }
    let s = JSON.parse(ser)
    let server = {
        publicKey: JsonToArray(s.publicKey),
    }
    let user = {
        secretKey: JsonToArray(usr.secretKey),
    }
    let decoded_message = nacl.box.open(message.cipher_text, message.one_time_code, server.publicKey, user.secretKey);

    //Get the human readable message
    let plain_text = nacl.util.encodeUTF8(decoded_message)

    //return the plaintext
    return plain_text;
};