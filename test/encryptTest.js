const fs = require('fs');
const path = require('path');
var x = new Uint8Array([
    212, 207, 136, 54, 136, 137, 99, 78,
    51, 36, 219, 162, 216, 41, 218, 247,
    236, 141, 67, 173, 219, 53, 52, 66,
    210, 45, 6, 255, 139, 41, 159, 175
]);
let str = JSON.stringify(x)
console.log(str)

console.log(JSON.parse(str))
console.log(x)

fs.unlink(path.join(__dirname, '../database', 'temp', 'record-1647039503178-342829909.pdf'), (err => {
    if (err) console.log(err);
    else {
        console.log("\nDeleted Temp File");
    }
}))