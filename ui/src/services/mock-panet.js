/*
 * panet 原生模块的 Web 预览 mock。
 * 仅在 aiot-cli preview (webpack 预览路径) 通过 app.json options.alias
 * 解析到本文件; 生产打包 (rollup) 不读该 alias, 真机上仍由
 * libjsapi_panet.so 提供原生 panet 模块。
 * 用 localStorage 模拟文件读写, 让预览时存档功能可用。
 */

function getStore() {
  try {
    if (typeof localStorage !== 'undefined' && localStorage) return localStorage
  } catch (e) {}
  var mem = {}
  return {
    getItem: function (k) {
      return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null
    },
    setItem: function (k, v) {
      mem[k] = String(v)
    },
  }
}

export var Panet = {
  readFile: function (path) {
    return new Promise(function (resolve, reject) {
      var v = getStore().getItem('panet:' + path)
      if (v != null) resolve(v)
      else reject(new Error('mock readFile not found: ' + path))
    })
  },
  writeFile: function (path, data) {
    return new Promise(function (resolve, reject) {
      try {
        getStore().setItem('panet:' + path, String(data))
        resolve(true)
      } catch (e) {
        reject(e)
      }
    })
  },
}
