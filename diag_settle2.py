import drive, time, datetime
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.common.by import By
today = datetime.date.today().isoformat()
seed = {"projects": [{"id": "p-1", "text": "L", "icon": "folder", "importance": 3,
                      "constellations": [{"id": "c1", "name": "C", "habitIds": ["h1"],
                        "steps": [{"id": "s1", "text": "Un", "completedDate": None},
                                  {"id": "s2", "text": "Deux", "completedDate": None},
                                  {"id": "s3", "text": "Trois", "completedDate": None}]}],
                      "journal": [], "dream": [], "sky": {"x": 25, "y": 40}}],
        "tasks": [], "events": [],
        "habits": [{"id": "h1", "name": "E", "icon": "sun", "completedDates": [today]}],
        "notes": [], "canvases": []}
d = drive.make()
def gaps():
    return d.execute_script("""
      var s = parseFloat(document.querySelector('.pstar').style.left), out = [];
      document.querySelectorAll('.bstar:not(.is-habit)').forEach(function (e) {
        out.push(Math.round((parseFloat(e.style.left) - s) * 100) / 100);
      });
      return out;
    """)
try:
    drive.boot(d, seed); drive.enter(d)
    d.execute_script("document.getElementById('skyBtn').click();"); time.sleep(1.6)
    print("rest      ", gaps())
    star = d.find_element(By.CSS_SELECTOR, ".pstar")
    ActionChains(d).click_and_hold(star).move_by_offset(230, 0).perform()
    ActionChains(d).release().perform()
    for w in (1.0, 2.0, 4.0, 6.0):
        time.sleep(1.0 if w == 1.0 else 1.0 if w < 4 else 2.0)
        print("after %.0fs " % w, gaps())
    print("errors:", drive.errs(d) or "none")
finally:
    d.quit()
