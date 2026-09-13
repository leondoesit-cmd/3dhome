"""Reproduce numerical ISO 286-2:2010 tables from the documented PDF.
Requires PyMuPDF. Only numeric limits are emitted, not the publication itself.
"""
import fitz,json,re,hashlib,sys
from iso286_finalize import finalize
source=sys.argv[1];doc=fitz.open(source)
def number(s):
 s=(s or '').replace('−','-').replace('—','0').replace(',','.').replace(' ','').replace('\n','')
 m=re.match(r'[+-]?\d+(?:\.\d+)?',s);return float(m[0]) if m else None
ranges=[]
for row in doc[11].find_tables().tables[0].extract()[2:]:
 lo,hi=number(row[0]),number(row[1])
 if lo is None or hi is None or hi<=lo:continue
 it={}
 for j,g in enumerate(['01','0']+list(map(str,range(1,19)))):
  v=number(row[j+2]);
  if v is not None:it[g]=round(v*(1000 if int(g)>=12 else 1),6)
 ranges.append({'min':lo,'max':hi,'it':it})
limits={};errors=[]
for page in range(14,51):
 p=doc[page];tabs=p.find_tables().tables
 t=max(tabs,key=lambda t:t.row_count*t.col_count);rows=t.extract();gradeRow=next(i for i,r in enumerate(rows[:4]) if sum(number(v) is not None for v in r[2:])>2)
 headers=rows[0];classes=[];current=''
 for j in range(2,len(headers)):
  if headers[j]:
   raw=headers[j].replace(' ','').replace('\n','')
   current=re.match('[A-Z]+',raw)[0] if page<32 else re.sub('[ab]$','',raw) if raw not in ['a','b','c','d','e','f','g','h','js','j','k','m','n','p','r','s','t','u','v','x','y','z','za','zb','zc'] else raw
  classes.append(current)
 # Shaft labels with superscripts: ab and bb mean a/b, not two-letter classes.
 classes=[{'ab':'a','bb':'b','cda':'cd','efa':'ef','fga':'fg','ta':'t','vb':'v','yc':'y'}.get(c,c) for c in classes]
 cells=[fitz.Rect(c) for c in t.cells if c]
 for i,row in enumerate(rows[gradeRow+1:],gradeRow+1):
  lo,hi=number(row[0]),number(row[1])
  if lo is None or hi is None or not hi>lo or hi>3150:continue
  for j,c in enumerate(classes,2):
   g=number(rows[gradeRow][j]);
   if g is None:continue
   g=int(g);cell=t.rows[i].cells[j]
   if cell is None:
    # Find the merged cell covering this row and column.
    yr=t.rows[i].bbox;xr=next((r.cells[j] for r in t.rows if r.cells[j]),None)
    if not xr:continue
    point=fitz.Point((xr[0]+xr[2])/2,(yr[1]+yr[3])/2)
    cell=next((r for r in cells if r.contains(point)),None)
   raw=p.get_textbox(fitz.Rect(cell)) if cell else ''
   clean=re.sub(r'[abc]','',raw).replace('−','-').replace(',','.')
   clean=re.sub(r'(?<=\d) (?=\d{3}(?:\D|$))','',clean)
   nums=re.findall(r'[+-]?\s*\d+(?:\.\d+)?',clean);values=[float(n.replace(' ','').replace('\n','')) for n in nums]
   if not values:continue
   if len(values)==1 and ('±' in clean or c.lower()=='js'):values=[abs(values[0]),-abs(values[0])]
   if len(values)!=2:errors.append((page,c,g,lo,hi,raw));continue
   upper,lower=values
   if c.lower() in ['h','js'] and g>=12:upper*=1000;lower*=1000
   if upper<lower:errors.append((page,c,g,lo,hi,'inverted '+raw));continue
   key=c+str(g);limits.setdefault(key,[]).append([lo,hi,round(lower,6),round(upper,6),page-6])
if errors:print(errors[:40]);raise SystemExit('Ambiguous cells: '+str(len(errors)))
for key,rows in limits.items():
 rows.sort();
 for a,b in zip(rows,rows[1:]):
  if a[1]>b[0]:raise ValueError((key,a,b))
out={'edition':'ISO 286-2:2010','source':'https://asremavad.com/wp-content/uploads/2018/12/ISO-286-2-2010-ISO-code-system-for-tolerances.pdf','sha256':hashlib.sha256(open(source,'rb').read()).hexdigest(),'ranges':ranges,'limits':limits}
out=finalize(out)
open(sys.argv[2],'w').write('// Numerical limits extracted from ISO 286-2:2010; see tools/data/extract_iso286.py.\nexport const ISO286 = '+json.dumps(out,separators=(',',':')).replace(']],',']],\n')+';\n')
print(len(ranges),'ranges',len(limits),'classes',sum(map(len,limits.values())),'limit rows')
