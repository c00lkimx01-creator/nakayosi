import asyncio
from pathlib import Path
from playwright.async_api import async_playwright
OUT=Path(__file__).parent
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True)
  page=await browser.new_page(viewport={'width':1280,'height':1800})
  await page.goto('http://localhost:8100/?route=in')
  await page.evaluate("document.querySelector('.glass-welcome span:last-child').replaceWith(document.querySelector('.glass-welcome span:last-child').cloneNode(true))")
  await page.wait_for_timeout(1800)
  print('font',await page.locator('.glass-welcome').evaluate('(e)=>getComputedStyle(e).fontFamily'))
  await page.locator('.welcome-container').screenshot(path=str(OUT/'welcome.png'))
  await page.goto('http://localhost:8100/?route=links')
  f=page.frame_locator('#instanceFrame')
  await f.locator('#links-page.active').wait_for(timeout=20000)
  tags=await f.locator('.lk-tag').evaluate_all('(es)=>es.map(e=>({text:e.textContent,color:getComputedStyle(e).backgroundColor}))')
  colors={}
  for t in tags:
   if t['text'] in colors: assert colors[t['text']]==t['color']
   colors[t['text']]=t['color']
  assert len(set(colors.values()))==len(colors),colors
  print('distinct colored tags',len(colors))
  await f.locator('#linkTagBar [data-tag="R18"]').click()
  link=f.locator('a[data-r18]').first
  assert await link.get_attribute('data-tag')=='R18|最強'
  await link.click()
  await f.get_by_role('dialog').wait_for(state='visible')
  await f.get_by_role('dialog').screenshot(path=str(OUT/'dialog-desktop.png'))
  assert await f.locator('.r18-badge').evaluate('(e)=>parseFloat(getComputedStyle(e).fontSize)')>=60
  await f.get_by_role('button',name='キャンセル',exact=True).click()
  assert not await f.get_by_role('dialog').is_visible()
  await link.click()
  await page.keyboard.press('Escape')
  assert not await f.get_by_role('dialog').is_visible()
  await link.click()
  frame=page.frames[1]
  await frame.evaluate("window.open=(...args)=>{window.__opened=args}")
  await f.get_by_role('button',name='それでも進む',exact=True).click()
  assert await frame.evaluate('window.__opened[0]')=='https://nm-tool-nk7s-1n.onrender.com/'
  assert not await f.get_by_role('dialog').is_visible()
  await f.locator('#linkTagBar [data-tag="最強"]').click()
  assert await link.is_visible()
  await f.locator('#linkTagBar [data-tag="ALL"]').click()
  await f.locator('#links-page').screenshot(path=str(OUT/'tags-desktop.png'))
  await page.set_viewport_size({'width':390,'height':844})
  await f.locator('#linkTagBar [data-tag="R18"]').click()
  await link.click()
  await f.get_by_role('dialog').screenshot(path=str(OUT/'dialog-mobile.png'))
  assert await f.locator('.r18-box').evaluate('(e)=>e.getBoundingClientRect().width')<=350
  await f.get_by_role('button',name='キャンセル',exact=True).click()
  assert await link.locator('.lk-tag').first.is_visible()
  await f.locator('#links-page').screenshot(path=str(OUT/'tags-mobile.png'))
  print('PASS: dual tags, colors, R18 cancel/Escape/continue, desktop/mobile')
  await browser.close()
asyncio.run(main())
