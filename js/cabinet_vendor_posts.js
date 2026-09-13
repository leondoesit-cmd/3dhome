// Narrow, independently authored serializers for rectangular-board vertical
// drilling. Format references and controller-managed fields: see workflow docs.
const n=v=>Number(v.toFixed(4)).toString();
const safe=s=>String(s).replace(/[^a-zA-Z0-9 .:_-]/g,'_').slice(0,120);
export function cabinetVendorProgram(dialect,setup,tool,profile) {
  const swapped=[90,270].includes(setup.rotation);
  const w=swapped?setup.panelDimensions.w:setup.panelDimensions.l;
  const h=swapped?setup.panelDimensions.l:setup.panelDimensions.w;
  const t=setup.panelDimensions.thickness;
  const ops=setup.operations.map(o=>({...o,x:o.x-setup.origin.x,y:o.y-setup.origin.y}));
  const note='SIMULATION ONLY - '+safe(setup.panelId)+' FACE '+setup.face;
  if(dialect==='mpr') {
    const lines=['\\ '+note,'[H','VERSION="4.0"','INCH="0"','MAT="'+profile.native.woodwopMachine+'"','OP="1"','FM="1"','FW="0"','',
      '[001','L="'+n(w)+'"','W="'+n(h)+'"','T="'+n(t)+'"','POX="0"','POY="0"','X="0"','Y="0"','',
      '<100 \\WerkStck\\','LA="L"','BR="W"','DI="T"','FNX="POX"','FNY="POY"','',
      '[K','<00 \\Koordinatensystem\\','NR="F0"','XP="0"','XF="1"','YP="0"','YF="1"','ZP="0"','ZF="1"','D1="0"','KI="0"','D2="0"','MI="0"'];
    for(const o of ops)lines.push('','<102 \\BohrVert\\','XA="'+n(o.x)+'"','YA="'+n(o.y)+'"',
      'BM="LS"','TI="'+n(o.depth)+'"','TNO="'+tool.number+'"','F_="'+n(tool.feed/1000)+'"');
    lines.push('','<101 \\Kommentar\\','KM="'+note+'"','KAT="Kommentar"','MNM="Kommentar"','!');
    return lines.join('\n')+'\n';
  }
  if(dialect==='cix') {
    const lines=['BEGIN ID CID3',' REL=5.0','END ID','','BEGIN MAINDATA',
      ' LPX='+n(w),' LPY='+n(h),' LPZ='+n(t),' ORLST="'+profile.native.biesseOrigin+'"',' SIMMETRY=1',' FCN=1',' MATERIAL="wood"','END MAINDATA'];
    ops.forEach((o,i)=>{
      // Explicit numeric depth (including breakthrough); disable automatic
      // through-depth substitution. Top face is 0 after the physical flip.
      const values={SIDE:0,CRN:'"1"',X:n(o.x),Y:n(h-o.y),Z:0,DP:n(o.depth),DIA:n(o.diameter),THR:0,RTY:-1,DX:0,DY:0,R:0,A:0,DA:0,NRP:0,
        ISO:'""',OPT:1,AZ:0,AR:0,AP:0,CKA:'azrNO',XRC:0,YRC:0,ARP:0,LRP:0,ER:'YES',MD:0,COW:'NO',A21:0,TOS:'NO',VTR:0,S21:-1,
        ID:'"P'+(i+1)+'"',AZS:0,MAC:'""',TNM:'"'+safe(tool.nativeName)+'"',TTP:0,TCL:0,RSP:n(tool.rpm),IOS:0,WSP:n(tool.feed),
        SPI:'""',DDS:0,DSP:0,BFC:0,SHP:0,EA21:'NO',CEN:'""',AGG:'""',LAY:'"BG"',PRS:0};
      lines.push('','BEGIN MACRO',' NAME=BG',...Object.entries(values).map(([k,v])=>' PARAM,NAME='+k+',VALUE='+v),'END MACRO');
    });
    lines.push('('+note+')');
    return lines.join('\n')+'\n';
  }
  if(dialect==='xxl') {
    const z=v=>n(profile.native.scmReverseZ?-v:v);
    const lines=['H DX='+n(w)+' DY='+n(h)+' DZ='+n(t)+' -A *MM /DEF','; '+note,
      'XPL X=0 Y=0 Z='+z(t)+' Q=0 R=0','XG0 Z='+z(profile.safeZ)+' T='+tool.number+' S='+n(tool.rpm)];
    for(const o of ops)lines.push('XG0 Z='+z(profile.safeZ),'XG0 X='+n(o.x)+' Y='+n(o.y),
      'XL2P Z='+z(-o.depth)+' V='+n(tool.feed),'XG0 Z='+z(profile.safeZ));
    lines.push('XPL X=0 Y=0 Z=0 Q=0 R=0','N X=0 Y=0 Z=0 ; home');
    return lines.join('\n')+'\n';
  }
  throw new Error('Unsupported native cabinet format.');
}
