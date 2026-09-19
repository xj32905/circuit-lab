export const PRESETS = [
  {
    id:'ce',title:'共射极放大器',eyebrow:'01 / 晶体管',tag:'反相 · 放大',icon:'transistor',
    summary:'输入的小变化控制集电极电流，集电极电阻把电流变化变成反向的电压变化。先比较 Vin 和 Vout，再试着增大输入振幅。',
    questions:['输出为什么与输入反相？','把输入振幅加大，波形会在哪里削顶？','增大发射极电阻，增益会怎样变化？'],
    assumptions:['Q1 使用 β=100 的通用 NPN 教学模型。','发射极电阻未旁路；输入、输出耦合电容隔离直流。','为直接观察小信号放大，耦合电容从近似静态工作点开始：Cin 为 −1.925V，Cout 为 6.750V。'],
    circuit:`$ 1 0.000005 50 55 12 50
w 256 80 384 80 0
r 256 80 256 240 0 82000
r 256 240 256 400 0 18000
t 256 240 384 240 0 1 0 0 100
w 256 400 384 400 0
g 256 400 256 432 0
R 256 80 160 80 0 0 40 12 0 0 0.5
r 384 80 384 224 0 3300
r 384 256 384 400 0 820
c 144 240 256 240 0 0.00001 -1.925179201 -1.925179201
R 144 240 80 240 0 1 200 0.08 0 0 0.5
c 384 224 528 224 0 0.00001 6.749938036 6.749938036
O 528 224 624 224 0
r 528 224 528 400 0 47000
g 528 400 528 432 0
x 188 152 214 155 4 13 R1
x 190 338 215 341 4 13 R2
x 405 148 431 151 4 13 Rc
x 405 337 431 340 4 13 Re
x 155 278 181 281 4 13 Vin
x 545 267 605 270 4 13 Vout
x 336 273 362 276 4 13 Q1
`,
    probes:[{label:'输入 Vin',element:10,post:0,quantity:'voltage'},{label:'输出 Vout',element:12,post:0,quantity:'voltage'},{label:'基极 Vb',element:3,post:0,quantity:'voltage'},{label:'集电极 Vc',element:3,post:1,quantity:'voltage'},{label:'发射极 Ve',element:3,post:2,quantity:'voltage'},{label:'Rc 电流',element:7,post:0,quantity:'current'}],
    components:[{element:1,id:'R1',name:'上偏置电阻'},{element:2,id:'R2',name:'下偏置电阻'},{element:3,id:'Q1',name:'NPN 三极管'},{element:6,id:'VCC',name:'直流电源'},{element:7,id:'Rc',name:'集电极电阻'},{element:8,id:'Re',name:'发射极电阻'},{element:9,id:'Cin',name:'输入耦合电容'},{element:10,id:'Vin',name:'正弦输入'},{element:11,id:'Cout',name:'输出耦合电容'},{element:13,id:'RL',name:'负载电阻'}],
    input:10,timeWindow:.025
  },
  {
    id:'rc',title:'RC 低通滤波器',eyebrow:'02 / 电容与频率',tag:'充放电 · 相位',icon:'wave',
    summary:'频率越高，电容越容易分走交流电流，输出振幅越小。调节 R 或 C，观察幅度与相位一起变化。',
    questions:['把频率从 100 Hz 调到 1 kHz，会发生什么？','改成方波后，为什么输出边沿变圆？','把电容加倍，截止频率会怎样变化？'],
    assumptions:['理想电阻、电容和信号源；默认 R=1kΩ，C=1µF，截止频率约 159Hz。'],
    circuit:`$ 1 0.000005 50 55 5 50
R 144 176 80 176 0 1 100 3 0 0 0.5
r 144 176 384 176 0 1000
c 384 176 384 336 0 0.000001 0 0
g 384 336 384 368 0
O 384 176 544 176 0
x 226 139 294 142 4 15 R1
x 414 266 478 269 4 15 C1
x 102 227 149 230 4 14 Vin
x 469 225 531 228 4 14 Vout
`,
    probes:[{label:'输入 Vin',element:0,post:0,quantity:'voltage'},{label:'输出 Vout',element:4,post:0,quantity:'voltage'},{label:'电容电流',element:2,post:0,quantity:'current'}],
    components:[{element:0,id:'Vin',name:'输入信号'},{element:1,id:'R1',name:'限流电阻'},{element:2,id:'C1',name:'滤波电容'}],input:0,timeWindow:.04
  },
  {
    id:'rectifier',title:'半波整流与滤波',eyebrow:'03 / 二极管',tag:'单向导通 · 纹波',icon:'diode',
    summary:'二极管只在输入高于电容电压加导通压降时导通。电容在峰值附近补充电荷，在其余时间向负载放电。',
    questions:['观察二极管电流，为什么不是整半周都有电流？','增大滤波电容，输出纹波如何变化？','把负载电阻减小，平均输出电压会怎样变化？'],
    assumptions:['D1 使用通用硅二极管模型。','滤波电容初始电压为 0，启动阶段会有充电过程。'],
    circuit:`$ 1 0.00001 50 55 10 50
v 144 352 144 144 0 1 50 8 0 0 0.5
d 144 144 368 144 1 0.805904783
c 368 144 368 352 0 0.0001 0 0
w 368 144 560 144 0
r 560 144 560 352 0 1000
w 144 352 368 352 0
w 368 352 560 352 0
g 368 352 368 400 0
O 560 144 640 144 0
x 236 108 277 111 4 14 D1
x 392 256 438 259 4 14 C1
x 581 256 624 259 4 14 RL
`,
    probes:[{label:'输入 Vin',element:0,post:1,quantity:'voltage'},{label:'输出 Vout',element:8,post:0,quantity:'voltage'},{label:'二极管电流',element:1,post:0,quantity:'current'},{label:'负载电流',element:4,post:0,quantity:'current'}],
    components:[{element:0,id:'Vin',name:'交流输入'},{element:1,id:'D1',name:'整流二极管'},{element:2,id:'C1',name:'滤波电容'},{element:4,id:'RL',name:'负载电阻'}],input:0,timeWindow:.1
  },
  {
    id:'opamp',title:'运放反相放大器',eyebrow:'04 / 负反馈',tag:'虚短 · 虚断',icon:'opamp',
    summary:'负反馈让反相输入端接近 0V，反馈电阻与输入电阻的比值决定闭环增益。输出达到电源限制时会削顶。',
    questions:['测量反相端，它的电压为什么接近 0V？','将 Rf 改为 10kΩ，放大倍数是多少？','把输入振幅改为 6V，输出还是正弦波吗？'],
    assumptions:['理想运放模型，开环增益 100000，隐含电源限幅为 ±15V；不模拟真实运放的带宽与压摆率。'],
    circuit:`$ 1 0.000005 50 55 15 50
R 112 192 48 192 0 1 100 1 0 0 0.5
r 112 192 288 192 0 1000
w 288 192 288 256 0
w 288 192 288 96 0
r 288 96 544 96 0 3000
w 544 96 544 272 0
a 288 272 416 272 0 15 -15 1000000 0 0 100000
w 416 272 544 272 0
g 288 288 288 352 0
O 544 272 624 272 0
x 181 157 229 160 4 14 Rin
x 396 60 443 63 4 14 Rf
x 343 315 371 318 4 14 U1
`,
    probes:[{label:'输入 Vin',element:0,post:0,quantity:'voltage'},{label:'输出 Vout',element:9,post:0,quantity:'voltage'},{label:'反相端 V−',element:6,post:0,quantity:'voltage'},{label:'Rf 电流',element:4,post:0,quantity:'current'}],
    components:[{element:0,id:'Vin',name:'正弦输入'},{element:1,id:'Rin',name:'输入电阻'},{element:4,id:'Rf',name:'反馈电阻'},{element:6,id:'U1',name:'理想运放'}],input:0,timeWindow:.04
  }
];
