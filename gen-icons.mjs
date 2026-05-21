import { Resvg } from '@resvg/resvg-js'
import { readFileSync, writeFileSync } from 'fs'

const svg = readFileSync('./public/favicon.svg', 'utf8')

for (const size of [192, 512]) {
  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: size } })
  const png = resvg.render().asPng()
  writeFileSync(`./public/pwa-${size}x${size}.png`, png)
  console.log(`✅ pwa-${size}x${size}.png`)
}
