import json
months=["Dec 26","Jan 27","Feb 27","Mar 27","Apr 27","May 27","Jun 27","Jul 27","Aug 27","Sep 27","Oct 27","Nov 27"]
RAMP=[0,150e3,150e3,300e3,300e3,300e3,450e3,450e3,450e3,450e3,450e3,450e3]
SC={
 "Low": dict(c0=1000,conv=.05,arpu=5500,ret=.20,g=.02),
 "Base":dict(c0=500, conv=.08,arpu=5800,ret=.30,g=.06),
 "High":dict(c0=350, conv=.11,arpu=6200,ret=.40,g=.10),
}
ORG0=130; out={}
for n,p in SC.items():
    active=0; rows=[]; cum=0; minc=0
    for i,m in enumerate(months):
        org=ORG0*((1+p['g'])**i); mk=RAMP[i]
        c=p['c0']*((mk/150e3)**0.3) if mk>0 else 0
        paid=mk/c if mk>0 else 0
        new=(org+paid)*p['conv']
        active=new+p['ret']*active
        rev=active*p['arpu']
        fixed=102e3+18e3*i/11
        var=.12*rev
        net=rev-fixed-var-mk
        cum+=net; minc=min(minc,cum)
        rows.append(dict(m=m,signups=round(org+paid),paid_signups=round(paid),new_payers=round(new,1),active=round(active),rev=round(rev),costs=round(fixed+var),mk=mk,net=round(net),cum=round(cum)))
    out[n]=dict(p=p,rows=rows,peak=round(-minc),rps=round(p['conv']*p['arpu']/(1-p['ret'])),tot_rev=round(sum(r['rev'] for r in rows)),tot_mk=sum(RAMP))
    print(n,out[n]['rps'],'peak',out[n]['peak'],'rev12',out[n]['tot_rev'],'mk',sum(RAMP))
    for r in rows: print(r['m'],r['signups'],r['active'],r['rev'],r['costs'],r['mk'],r['net'],r['cum'])
json.dump(out,open('proj2.json','w'))
