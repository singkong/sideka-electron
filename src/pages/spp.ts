var $ = require('jquery');
require('jquery-ui-bundle');

import { remote, app as remoteApp, shell } from "electron";
import * as fs from "fs";
import { apbdesImporterConfig, Importer } from '../helpers/importer';
import { exportApbdes } from '../helpers/exporter';
import { Siskeudes } from '../stores/siskeudes';
import dataApi from "../stores/dataApi";
import settings from '../stores/settings';
import schemas from '../schemas';
import { initializeTableSearch, initializeTableCount, initializeTableSelected } from '../helpers/table';
import SumCounter from "../helpers/sumCounter";
import diffProps from '../helpers/diff';
import titleBar from '../helpers/titleBar';

import { Component, ApplicationRef, NgZone, HostListener} from "@angular/core";
import {ActivatedRoute} from "@angular/router";

const path = require("path");
const jetpack = require("fs-jetpack");
const Docxtemplater = require('docxtemplater');
const Handsontable = require('./handsontablep/dist/handsontable.full.js');

const fields = [
    {
        category:'rincian',
        fieldName:['Kd_Rincian','Nama_Obyek','','Sumberdana','Nilai']
    },
    {
        category:'pengeluaran',
        fieldName:['No_Bukti','Keterangan_Bukti','Tgl_Bukti','','Nilai_SPP_Bukti','Nm_Penerima','Alamat','Nm_Bank','Rek_Bank','NPWP']
    },
    {
        category:'potongan',
        fieldName:['Kd_Potongan','Nama_Obyek','','','Nilai_SPPPot']
    }
    ];
const currents = [
    {
        category:'rincian',
        fieldName:'Kd_Rincian',
        value:'',
        code:''
    },
    {
        category:'pengeluaran',
        fieldName:'No_Bukti',
        value:'',
        code:''
    },
    {
        category:'potongan',
        fieldName:'Kd_Potongan',
        value:'',
        code:''

    }
    ];

const potonganDescs = [{code:'7.1.1.01.',value:'PPN'},{code:'7.1.1.02.',value:'PPh Pasal 21'},{code:'7.1.1.03.',value:'PPh Pasal 22'},{code:'7.1.1.04.',value:'PPh Pasal 23'}]


var app = remote.app;
var hot;

var sheetContainer;
var appDir = jetpack.cwd(app.getAppPath());
var DATA_DIR = app.getPath("userData");

window['jQuery'] = $;
window['app'] = app;
require('./node_modules/bootstrap/dist/js/bootstrap.js');

@Component({
    selector: 'spp',
    templateUrl: 'templates/spp.html',
    host: {
        '(window:resize)': 'onResize($event)'
    }
})

export default class SppComponent{
    hot: any;
    siskeudes:any; 
    sub:any;
    savingMessage: string;
    hots:any={};
    categorySelected:string;
    contentSelection:any={};
    potonganDesc:string;
    evidenceNumber:string;
    regionCode:string;
    year:string;
    isExist:boolean;
    message:string;
    refDatasets:any={};
    kdKegiatan:string;
    sppNumber:string;
    initialDataRAB:any;
    

    constructor(private appRef: ApplicationRef, private zone: NgZone, private route:ActivatedRoute){  
        this.appRef = appRef;       
        this.zone = zone;
        this.route = route;   
        this.isExist = false;   
        this.kdKegiatan = "";
        this.siskeudes = new Siskeudes(settings.data["siskeudes.path"]); 
        this.sub = this.route.queryParams.subscribe(params=>{
            this.sppNumber = params['no_spp'];  
            this.regionCode = params['kd_desa'];  
            this.year = params['tahun'];              
            this.getReferences();   
        });
    }

    initSheet(sheetContainer){ 
        let me = this; 
        let config =    {
            data: [],
            topOverlay: 34,

            rowHeaders: true,
            colHeaders: schemas.getHeader(schemas.spp),        
            columns: schemas.spp,

            colWidths: schemas.getColWidths(schemas.spp),
            rowHeights: 23,

            columnSorting: true,
            sortIndicator: true,
            hiddenColumns: {
                columns:schemas.spp.map((c,i)=>{return (c.hiddenColumn==true) ? i:''}).filter(c=>c!== '')
            },
            outsideClickDeselects: false,
            autoColumnSize: false,
            search: true,
            schemaFilters: true,
            contextMenu: ['undo', 'redo', 'row_above', 'remove_row'],
            dropdownMenu: ['filter_by_condition', 'filter_action_bar']
        }
        let result = new Handsontable(sheetContainer, config);

        result.addHook("afterChange", (changes, source) => {
            if(source === 'edit' || source === 'undo' || source === 'autofill'){
                let renderer = false;

                changes.forEach(item => {
                    let row = item[0];
                    let col = item[1];
                    let prevValue = item[2];
                    let value = item[3];

                    if(col === 2)
                        renderer = true;
                });
            }
        });
        result.addHook("beforeRemoveRow", (index, amount) => {
            console.log(index);
        });
        
        return result;
    }

    onResize(event) {
        setTimeout(function() {            
            hot.render()
        }, 200);
    }

    ngOnInit(){  
        titleBar.blue("SPP - " +dataApi.getActiveAuth()['desa_name']);       
        $('#datePicker').datepicker({ dateFormat: 'dd-mm-yy' })
        let that = this;     
        
        let sheetContainer = document.getElementById("sheet");
        this.hot = hot = this.initSheet(sheetContainer);
        hot.render();

        this.siskeudes.getDetailSPP(this.sppNumber,data=>{
            let results = [];
            data.forEach(content=>{   
                fields.forEach((item,idx)=>{
                    let res=[];
                    let current = currents.filter(c=>c.category==item.category)[0];
                    if(content[current.fieldName] || content[current.fieldName] !== null){
                        res.push(current.category);
                        for(let i=0;i< item.fieldName.length;i++){
                            let contentPush = (item.fieldName[i] == '') ? '':content[item.fieldName[i]];
                            res.push(contentPush);
                        }
                        if(current.value != content[current.fieldName])
                            results.push(res);                        
                        current.value = content[current.fieldName]; 
                    }
                });           
            });         

            hot.loadData(results);
            setTimeout(function() {
                hot.render();
            }, 200);
        });        
    }
        
    openAddRowDialog(){
        let selected = this.hot.getSelected();       
        let category = 'rincian'; //{1:'rincian',2:'pengeluaran',3:'potongan'}
        let sourceData = this.hot.getSourceData();   

        if(selected){
            let data = this.hot.getDataAtRow(selected[0]);
            category = (data[0] =='pengeluaran') ? 'potongan':((data[0] =='potongan')? 'potongan':'pengeluaran');
        }

        this.categorySelected = category;
        $("#modal-add").modal("show"); 
        $('input[name=category][value='+category+']').checked = true;  

        (sourceData.length < 1 || category !='rincian') ? this.categoryOnChange(category) : this.getCodeAndChangeSelection();        
    }

    addRow(){
        let position=0;
        let results = [];
        let data = {}; 
        let currentCode;
        let sourceData = this.hot.getSourceData();        
        let currentField = fields.filter(c=>c.category==this.categorySelected).map(c=>c.fieldName)[0];
        $("#form-add").serializeArray().map(c=> {data[c.name]=c.value});

        if(this.isExist)
            return;

        switch(this.categorySelected){
            case 'rincian':
                data = this.refDatasets.rincianRAB.filter(c=>c.Kd_Rincian==data['Kd_Rincian'])[0]; 
                position = sourceData.length;
                break;
            
            case 'pengeluaran':                
                for(let i = 0;i<sourceData.length;i++){
                    if(sourceData[i][0]=='rincian')
                        currentCode = sourceData[i][1];
                    if(currentCode == data['Kd_Rincian'])
                        position = i+1;
                }
                break;
                       
            case 'potongan':
                for(let i = 0;i<sourceData.length;i++){
                    if(sourceData[i][0]=='pengeluaran')
                        currentCode = sourceData[i][1];
                    if(currentCode == data['Bukti_Pengeluaran_Selected'])
                        position = i+1;
                }

                let currentPotongan = this.refDatasets.potongan.filter(c=>c.Kd_Potongan==data['Kd_Potongan'])[0]
                data['Nama_Obyek'] = currentPotongan.Nama_Obyek;
                break;
            
        }

        results.push(this.categorySelected);

        for(let i=0;i<currentField.length;i++){
            let value = (data[currentField[i]]) ? data[currentField[i]]:'';
            results.push(value);            
        }
        
        this.hot.alter("insert_row", position);
        this.hot.populateFromArray(position, 0, [results], position, currentField.length, null, 'overwrite');
    }

    addOneRow(): void{
        this.addRow();
        $("#modal-add").modal("hide");
        $('#form-add')[0].reset();
       
    }

    addOneRowAndAnother():void{        
        this.addRow();  
    }

    categoryOnChange(value):void{
        this.isExist=false;
        switch(value){
            case 'rincian':{
                let sourceData = this.hot.getSourceData();
                if(sourceData.length >= 1) {
                    this.getCodeAndChangeSelection();
                    break;
                }
                this.kdKegiatan='';
                this.contentSelection['allKegiatan'] = this.refDatasets["allKegiatan"];                
                break;
            }
            case 'pengeluaran':
            case 'potongan':{    
                let sourceData = this.hot.getSourceData();
                let rincian = sourceData.filter(c=>c[0] =='rincian');
                this.contentSelection['availableRincian'] = rincian;
                this.evidenceNumber = '00000/KWT/'+this.regionCode+this.year;
                break;
            }
        }
    } 

    getCodeAndChangeSelection():void{
        let sourceData = this.hot.getSourceData();
        let row = sourceData.filter(c=>c[0]=='rincian')[0];
        let code = row[1];
        this.siskeudes.getKegiatanByCodeRinci(code,data=>{
            this.kdKegiatan = data[0].Kd_Keg;
            this.selectedOnChange(this.kdKegiatan);
        });
    }  

    selectedOnChange(value):void{ 
        switch(this.categorySelected){
            case 'rincian':
                this.siskeudes.getSisaAnggaranRAB(value,data=>{
                    this.refDatasets["rincianRAB"] = data;
                    this.contentSelection["rincianRAB"] = data;
                });
                break;
            
            case 'potongan':
                let sourceData = this.hot.getSourceData();
                let currentCode ='';
                let results = [];
                for(let i = 0;i<sourceData.length;i++){
                    if(sourceData[i][0]=='rincian')
                        currentCode = sourceData[i][1];
                        
                    if(currentCode == value && sourceData[i][0] != 'rincian' && sourceData[i][0]!='potongan')                        
                        results.push(sourceData[i]);
                }
                this.contentSelection['availablePengeluaran'] = results;
                break;            
        }  
    }

    checkIsExist(value,message){
        this.message = message;
        let sourceData = this.hot.getSourceData();
        for(let i=0;i<sourceData.length;i++){
            if(sourceData[i][1]==value){
                this.isExist = true;                
                break;
            }
            this.isExist = false;
        }
    }

    taxOnChange(value){
        this.checkIsExist(value,'Potongan');
        let res = potonganDescs.filter(c=>c.code == value)[0];
        (!res)  ? this.potonganDesc = '' : this.potonganDesc = res.value;   
    }

    getReferences():void{
        this.siskeudes.getRefPotongan(data=>{
            this.refDatasets["potongan"] = data;            
        })

        this.siskeudes.getAllKegiatan(this.regionCode,data=>{
            this.refDatasets["allKegiatan"] = data;
        })
    }

    getnewCode(code, fieldNumber){
        code = (code == '') ? '1': (parseInt(code)+1).toString();
        let newCode;
        for(let i = 0; i < fieldNumber+1;i++){
            let code = (currents[i].code == '') ? '1': (parseInt(currents[i].code)+1).toString();
            newCode = ((fieldNumber - i) == 0) ? code : code+'.';
        }
        return newCode;
    }

}
