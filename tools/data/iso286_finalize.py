"""Apply documented corrigenda, footnotes and width validation to numeric facts."""
import re
CORRIGENDUM='https://www.iso.org/obp/ui#iso:std:iso:286:-2:ed-2:v1:cor:1:v1:en'
def finalize(data):
 limits=data['limits']; corrections=[]
 # ISO 286-2:2010/Cor 1:2013, tables 2,6,7,8,12,17,24,30.
 for key,lo,hi,old,new in [
  ('A9',180,200,[60,775],[660,775]),('H1',2500,3150,[0,25],[0,26]),
  ('JS1',3,6,[-.05,.05],[-.5,.5]),('JS1',6,10,[-.05,.05],[-.5,.5]),
  ('J6',250,315,[-5,25],[-7,25]),('S9',100,120,[-165,-79],[-166,-79]),
  ('S9',450,500,[-387,-252],[-407,-252]),('S10',10,18,[-96,-28],[-98,-28]),
  ('c12',0,3,[-150,-60],[-160,-60]),('k13',3,6,[0,190],[0,180]),
  ('x9',250,280,[475,650],[475,605])]:
  row=next(r for r in limits[key] if r[:2]==[lo,hi]);assert row[2:4]==old,(key,row)
  row[2:4]=new;corrections.append({'class':key,'min':lo,'max':hi,'source':'corrigendum-2013'})
 # Table 31 has an additional width inconsistency not listed in Cor 1.
 # ei=820 is shared by za7..za11. Apply the published es=ei+IT rule:
 # Table 1 IT11=290, hence es=1110. This derivation is NOT an ISO erratum.
 row=next(r for r in limits['za11'] if r[:2]==[225,250]);assert row[2:4]==[820,1100]
 row[3]=1110;corrections.append({'class':'za11','min':225,'max':250,'source':'derived-es-equals-ei-plus-IT','originalUpperUm':1100,'lowerUm':820,'ITUm':290})
 for key,rows in limits.items():
  letter=re.match('[A-Za-z]+',key)[0];grade=int(re.search(r'\d+',key)[0])
  # Explicit forbidden <=1 mm bands. Other blank cells remain absent.
  minimum=1 if letter in ['A','B','a','b'] or letter=='N' and grade in [9,10,11] or letter in ['H','h','JS','js'] and grade>=14 else 0
  for row in rows:row[0]=max(row[0],minimum)
  limits[key]=[r for r in rows if r[1]>r[0]]
 # Table 8 footnote a sends J9 and higher to symmetric Table 7.
 for grade in range(9,19):limits['J'+str(grade)]=[r.copy() for r in limits['JS'+str(grade)]]
 for key,rows in limits.items():
  grade=re.search(r'\d+',key)[0]
  for lo,hi,lower,upper,page in rows:
   it=next(r['it'][grade] for r in data['ranges'] if hi<=r['max'])
   assert abs(upper-lower-it)<1e-6,(key,lo,hi,lower,upper,it)
 data.update(edition='ISO 286-2:2010 + Cor 1:2013',corrigendum=CORRIGENDUM,corrections=corrections)
 return data
