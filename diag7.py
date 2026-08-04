import drive
d = drive.make()
try:
    d.get(drive.URL)
    print(d.execute_script("""
      var xhr = new XMLHttpRequest();
      xhr.open('GET', 'app.js', false);
      xhr.send(null);
      try { new Function(xhr.responseText); return 'PARSES OK'; }
      catch (e) { return e.name + ': ' + e.message + '  @line ' + (e.lineNumber || '?'); }
    """))
finally:
    d.quit()
