import asyncio, os
from pathlib import Path
from playwright.async_api import async_playwright
BASE=os.environ.get('CHOCO_TEST_URL','http://localhost:8901')
OUT=Path(os.environ.get('CHOCO_SCREENSHOTS','/tmp/browser/choco-v3'))
OUT.mkdir(parents=True,exist_ok=True)
async def open_page(page,route):
 await page.goto(BASE+'/?route='+route)
 await page.frame_locator('#instanceFrame').locator('#'+route+'-page.active').wait_for(timeout=30000)
 return page.frame_locator('#instanceFrame')
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True)
  context=await browser.new_context(viewport={'width':1280,'height':1800})
  page=await context.new_page()
  errors=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  f=await open_page(page,'weather')
  frame=page.frames[1]
  # Rule: new visitors default to Higashiosaka, with its correct JMA codes.
  assert await frame.evaluate('[WX_PREF,WX_CITY,WX_TOWN]')==['大阪府','270000','2722700']
  # Rule: weather map removed, with no embedded map anywhere on weather page.
  assert await f.locator('#weather-page iframe').count()==0
  await f.locator('#wxTown option[value="2722700"]').wait_for(state='attached',timeout=60000)
  assert await f.locator('#wxTown').input_value()=='2722700'
  await f.locator('#wxLoc').filter(has_text='東大阪市').wait_for(timeout=60000)
  assert '東大阪市' in await f.locator('#wxLoc').inner_text()
  print('PASS: Higashiosaka default, current forecast fetched, no map')
  await f.locator('#weather-page').screenshot(path=str(OUT/'weather.png'))
  f=await open_page(page,'links')
  star=f.locator('.link-favorite').first
  url=await star.get_attribute('data-url')
  assert await star.get_attribute('aria-pressed')=='false'
  before=len(context.pages)
  await star.click()
  assert await star.get_attribute('aria-pressed')=='true'
  assert len(context.pages)==before
  await f.locator('[data-tag="MY_FAVORITES"]').click()
  assert await f.locator('#linkCats li:visible').count()>=1
  await f.locator('#links-page').screenshot(path=str(OUT/'favorites-desktop.png'))
  # Rule: personal favorite selection persists after reload.
  f=await open_page(page,'links')
  star=f.locator('.link-favorite').first
  assert await star.get_attribute('aria-pressed')=='true'
  assert await star.get_attribute('data-url')==url
  await f.locator('[data-tag="MY_FAVORITES"]').click()
  await star.click()
  assert await f.locator('#linkCats li:visible').count()==0
  # Rule: removing a favorite also persists.
  f=await open_page(page,'links')
  assert await f.locator('.link-favorite').first.get_attribute('aria-pressed')=='false'
  await f.locator('#searchInput').fill('abema')
  await f.locator('#searchInput').dispatch_event('keyup')
  assert await f.locator('#linkCats li:visible').count()>0
  await f.locator('#searchInput').fill('')
  await f.locator('#searchInput').dispatch_event('keyup')
  await page.frames[1].evaluate("filterLinks('');filterLinksByTag('ALL')")
  await page.set_viewport_size({'width':390,'height':844})
  await f.locator('.link-favorite').first.click()
  await f.locator('[data-tag="MY_FAVORITES"]').click()
  await f.locator('#links-page').screenshot(path=str(OUT/'favorites-mobile.png'))
  assert await page.frames[1].evaluate('document.documentElement.scrollWidth<=window.innerWidth')
  print('PASS: add/remove/reload/filter personal favorites; header search preserved; mobile fits')
  # Rule: saved non-default weather preferences are retained.
  await page.frames[1].evaluate("saveSettings({wxPref:'東京都',wxCity:'130010',wxTown:''})")
  f=await open_page(page,'weather')
  assert await page.frames[1].evaluate('[WX_PREF,WX_CITY,WX_TOWN]')==['東京都','130010','']
  print('PASS: saved weather region retained')
  print('Page errors:',errors)
  assert not errors
  await browser.close()
asyncio.run(main())
