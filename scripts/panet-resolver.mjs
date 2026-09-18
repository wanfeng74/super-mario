/* Resolve 'panet' to the Node mock for integration tests */
export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'panet') {
    return {
      url: new URL('./panet-mock.mjs', import.meta.url).href,
      shortCircuit: true,
    }
  }
  return nextResolve(specifier, context)
}
