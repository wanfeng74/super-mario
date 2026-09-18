/* panet mock for Node integration test: records every call */
export const __calls = []

export class Panet {
  mkdirs(p) {
    __calls.push(['mkdirs', p])
    return Promise.resolve(true)
  }
  writeFile(p, d) {
    __calls.push(['writeFile', p, String(d)])
    return Promise.resolve(true)
  }
  readFile(p) {
    __calls.push(['readFile', p])
    return Promise.resolve(null)
  }
  exists(p) {
    __calls.push(['exists', p])
    return Promise.resolve(false)
  }
}
