#!/usr/bin/env python3
"""Destructive only to this companion's data on the specified emulator."""
import json, os, re, subprocess, sys, time, xml.etree.ElementTree as ET
from pathlib import Path
serial=sys.argv[1] if len(sys.argv)>1 else 'emulator-5554'
if not serial.startswith('emulator-'): raise SystemExit('Use an emulator; this test resets its survey app data.')
adb=str(Path(os.environ.get('ANDROID_HOME',Path.home()/'Library/Android/sdk'))/'platform-tools/adb')
package='local.modelforge.survey'
def run(*args): return subprocess.check_output([adb,'-s',serial,*args],text=True).strip()
def shell(*args): return run('shell',*args)
def nodes():
    for attempt in range(6):
        shell('rm','-f','/sdcard/survey-test.xml')
        shell('uiautomator','dump','/sdcard/survey-test.xml')
        try:
            result=list(ET.fromstring(shell('cat','/sdcard/survey-test.xml')).iter('node'))
            if result: return result
        except (subprocess.CalledProcessError,ET.ParseError): pass
        time.sleep(.25)
    raise AssertionError('Android accessibility tree did not become ready')
def tap(text):
    for attempt in range(4):
        node=next((n for n in nodes() if (n.get('text','').casefold()==text.casefold() or n.get('hint','').casefold()==text.casefold())),None)
        if node is not None:
            x1,y1,x2,y2=map(int,re.findall(r'\d+',node.get('bounds')))
            if x2>x1 and y2>y1: shell('input','tap',str((x1+x2)//2),str((y1+y2)//2));return
        shell('input','swipe','500','1700','500','500','250')
    raise AssertionError('Control not found: '+text)
def launch():
    shell('input','keyevent','224');shell('wm','dismiss-keyguard');shell('input','keyevent','4');shell('am','force-stop',package);shell('am','start','-W','-n',package+'/.MainActivity');time.sleep(.5)
def saved(): return json.loads(shell('run-as',package,'cat','files/recovery.json'))
def wait_count(count):
    deadline=time.monotonic()+8
    while time.monotonic()<deadline:
        if len(saved()['survey']['observations'])==count: return
        time.sleep(.1)
    raise AssertionError('Reading count did not reach '+str(count))
shell('pm','clear',package)
for language,field,save,success in [('en','Centimetres · interior face','Save manual reading','Reading saved for review'),('he','סנטימטרים · פאה פנימית','שמירת מדידה ידנית','המדידה נשמרה לבדיקה')]:
    shell('cmd','locale','set-app-locales',package,'--locales',language);launch()
    tap(field);shell('input','text','273.5');shell('input','keyevent','4');tap(save)
    assert any(n.get('text')==success for n in nodes()), 'Missing save feedback'
    before=saved();assert before['survey']['observations'][-1]['value']==273.5
    launch();assert saved()==before, 'Recovery changed readings'
    tap('Undo last reading' if language=='en' else 'ביטול המדידה האחרונה')
    wait_count(len(before['survey']['observations'])-1)
    tap(field);shell('input','text','280');shell('input','keyevent','4');tap(save);nodes()
    # A failed disk write must not consume the entry or duplicate it on retry.
    before=saved();tap(field);shell('input','text','999');shell('input','keyevent','4')
    shell('run-as',package,'chmod','500','files')
    try:
        tap(save);nodes();assert saved()==before, 'Failed write replaced evidence'
    finally: shell('run-as',package,'chmod','700','files')
    tap(save);wait_count(len(before['survey']['observations'])+1)
    assert saved()['survey']['observations'][-1]['value']==999
    before=saved();tap('Capture room corners with AR' if language=='en' else 'סריקת פינות חדר במציאות רבודה')
    deny=next((n for n in nodes() if n.get('resource-id','').split('/')[-1] in ('permission_deny_button','permission_deny_and_dont_ask_again_button')),None)
    if deny is not None: tap(deny.get('text'))
    assert saved()==before, 'Camera denial changed saved evidence'
    for attempt in range(4):
        if any(n.get('text','').casefold()==save.casefold() for n in nodes()): break
        time.sleep(.25)
    else: raise AssertionError('Manual capture unavailable after denial')
    tap('Share portable survey'  if language=='en' else 'שיתוף קובץ מדידה')
    export=json.loads(shell('run-as',package,'cat','cache/exports/property.mfsurvey.json'))
    assert export==saved(), 'Share export lost evidence'
    Path('/tmp/modelforge-android-export.mfsurvey.json').write_text(json.dumps(export))
    print(language+': manual entry, restart recovery, undo, failed-write retry, camera denial and share export passed',flush=True)
print('Android emulator checks passed. Export: /tmp/modelforge-android-export.mfsurvey.json')
