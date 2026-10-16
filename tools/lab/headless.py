"""Run balance batches in headless Chrome (no window, never throttled), several in parallel.
  python tools/lab/headless.py v27n:smart,auto:1:40 v27eh:smart,auto:0,2:20 ...
Each job is tag:strategies:diffs:runs[:seed0[:hp0,hp1]] -> tools/lab/out/balance_<tag>.json (needs tools/serve.py on :8765).
"""
import json, os, shutil, subprocess, sys, tempfile, time, urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'out')
CHROME = r'C:\Program Files\Google\Chrome\Application\chrome.exe'


def job(spec):
    tag, strats, diffs, runs, *rest = spec.split(':')
    plan = {'id': tag, 'runs': [{'runs': int(runs), 'strategies': strats.split(','), 'diffs': [int(d) for d in diffs.split(',')], 'tag': tag, 'seed0': int(rest[0]) if rest and rest[0] else 1000}]}
    if len(rest) > 1:  # hp0,hp1: override the enemy HP curve of those difficulties (sweeps)
        plan['hp'] = [float(x) for x in rest[1].split(',')]
    return plan


def launch(i, spec):
    plan = job(spec)
    done = os.path.join(OUT, 'lab_done_%s.json' % plan['id'])
    if os.path.exists(done):
        os.remove(done)
    url = 'http://localhost:8765/index.html?mute=1&lab=' + urllib.parse.quote(json.dumps(plan, separators=(',', ':')))
    prof = tempfile.mkdtemp(prefix='laolab_')
    p = subprocess.Popen([CHROME, '--headless=new', '--mute-audio', '--user-data-dir=' + prof, '--remote-debugging-port=%d' % (9400 + i),
                          '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
                          '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=1280,720', url],
                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    print('started', plan['id'], flush=True)
    return (plan['id'], done, p, prof)


def main(specs, width=8):
    queue = list(enumerate(specs))
    running = []
    t0 = time.time()
    while queue or running:
        while queue and len(running) < width:
            running.append(launch(*queue.pop(0)))
            time.sleep(20)  # staggered: cold loads at once stall the single dev server
        time.sleep(10)
        for item in list(running):
            tag, done, p, prof = item
            if os.path.exists(done):
                subprocess.run(['taskkill', '/PID', str(p.pid), '/T', '/F'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                running.remove(item)
                shutil.rmtree(prof, ignore_errors=True)
                print('done %s after %.0f s' % (tag, time.time() - t0), flush=True)
    print('all done', flush=True)


if __name__ == '__main__':
    main(sys.argv[1:])
