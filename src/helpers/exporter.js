import fs from 'fs';
import XLSX from 'xlsx'; 
import d3 from 'd3';
import schemas from '../schemas';
import { remote, app, shell } from 'electron'; // native electron module
import Excel from 'exceljs';

var exportToExcel= function(data,headers,width,nameSheet,lengthApbdesCode){
	var workbook = new Excel.Workbook();
	workbook.creator = "Sideka";
	workbook.created = new Date();
	var sheet = workbook.addWorksheet(nameSheet);
	var worksheet = workbook.getWorksheet(nameSheet);
	var dataHeader =[];
	var style={
		font : { name: 'Times New Roman', family: 4, size: 11, bold: true },		
		alignment: { vertical: "middle", horizontal: "center" },
		border: {top: {style:'thin'},left: {style:'thin'},bottom: {style:'thin'},right: {style:'thin'}}

	};	
	
	//headers
	if(nameSheet.toLowerCase() !=="apbdes"){
		for(var C = 0; C != headers.length; ++C) {
			dataHeader.push({
				header:headers[C],
				width:width[C]
			})
		}
	}else{
		for(var C = 0; C != headers.length; ++C) {
			if(C == 0){
				for(var i=0; i != lengthApbdesCode; i++){
					dataHeader.push({
						header:"Kode Rekening",
						width:5
					})
				}				
			}
			else{
				dataHeader.push({
					header:headers[C],
					width:width[C]
				})
			}
		}

	}
	worksheet.columns=dataHeader;

	if(nameSheet.toLowerCase() !=="apbdes"){
		//apply number format
		if(nameSheet.toLowerCase()==="data penduduk")
			var indexNIK = headers.indexOf("NIK");
		else if(nameSheet === "Data Keluarga")
			var indexNIK = headers.indexOf("NIK Kepala Keluarga");	
		var indexNoKK = headers.indexOf("No KK");

		worksheet.getColumn(++indexNik).numFmt = '@'; 
		worksheet.getColumn(++indexNoKK).numFmt = '@'; 
			
	}else{
		var indexAnggaran;
		var col = String.fromCharCode(64 + lengthApbdesCode);

		worksheet.mergeCells('A1:'+col+1);		
		dataHeader.some((elem, i) => {
			return elem.header === 'Anggaran' ? (indexAnggaran = i, true) : false;
		});
		worksheet.getColumn(++indexAnggaran).numFmt  = '#,##0';; 
	}
	//data
	for(var R = 0; R < data.length; ++R) {
		var dataRow=[];
		for(var C = 0; C != data[R].length; ++C) {
			dataRow[C] = data[R][C];
		}
		worksheet.addRow(dataRow);
	}

	//apply style
	worksheet.getRow(1).font = style.font;
	worksheet.getRow(1).alignment = style.alignment;	

	//frozen panes
	worksheet.views = [{state: 'frozen', ySplit: 1, activeCell: 'A1'}];

	var fileName = remote.dialog.showSaveDialog({
		filters: [
			{name: 'Excel Workbook', extensions: ['xlsx']},
		]
	});

	if(fileName){
		workbook.xlsx.writeFile(fileName).then(
			function() {
				shell.openItem(fileName);
			},
			function(e){
				var message = "File Masih Digunakan"
				if(e.code != "EBUSY")
					message = e.message;					
				remote.dialog.showErrorBox("Error", message);
		});
	}
}

var convertWidth = function(width){
	var data = [];
	for(var i=0; i != width.length; i++){
		data.push(width[i]/7);
	}
	return data;
}

var splitAccountCode = function(data, maxLengthCode){
	var result=[];
	for(var i = 0; i != data.length;i++){
		var resultSplit =[];
		for(var x = 0; x != data[i].length; x++){			
			if(x==0){									
				var accountCode=[];
				if(data[i][x]!= null) accountCode = data[i][0].split(".");				
				for(var j=0;j != maxLengthCode;j++){
					if(accountCode[j]) resultSplit.push(parseInt(accountCode[j]));
					else resultSplit.push(null);
				}
			}else
				resultSplit.push(data[i][x]);			
		}
		result.push(resultSplit);
	}
	return result;	 
}

var getMaxLengthCode = function(accountCodes){
	accountCodes = accountCodes.filter(c=>c != null);
	var longest = accountCodes.sort((a, b) => { return b.length - a.length; })[0];
	var maxLengthCode = longest.split(".");
	return maxLengthCode.length;
}

export var exportPenduduk = function(data, nameSheet)
{	
    var headers = schemas.getHeader(schemas.penduduk);   
	var width = convertWidth(schemas.getColWidths(schemas.penduduk));  
	exportToExcel(data,headers,width,nameSheet);
	
};

export var exportKeluarga = function(data,nameSheet)
{
	var headers = schemas.getHeader(schemas.keluarga);    
	var width = convertWidth(schemas.getColWidths(schemas.penduduk)); 
	exportToExcel(data,headers,width,nameSheet);	
	
};

export var exportApbdes = function(data, nameSheet)
{	
	var accountCodes = data.map(c => c[0]);
	var maxLengthCode = getMaxLengthCode(accountCodes);
	var result = splitAccountCode(data, maxLengthCode);	
	var headers = schemas.getHeader(schemas.apbdes);
	var width = convertWidth(schemas.getColWidths(schemas.apbdes)); 
	exportToExcel(result,headers,width,nameSheet,maxLengthCode);	
};
