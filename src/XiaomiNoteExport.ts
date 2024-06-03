var GSparkMD5:any//MD5 digest module
class Folder{
	subject:string=""//folder display name
	notes:Array<string>=[]
}

class ImgData{
	data:string=""//base64 encoded data
	width:number=0
	height:number=0
	hash:string=""//md5 hex string
	mime:string=""
}

class SoundData{
	data:string=""//base64 encoded data
	hash:string=""//md5 hex string
	mime:string=""
}


function toTimeString(ts:number|Date):string{
    const date=ts instanceof(Date)?ts: new Date(ts)
	return `${date.getUTCFullYear().toString().padStart(4,"0")}`+
	`${(date.getUTCMonth()+1).toString().padStart(2,"0")}`+
	`${date.getUTCDate().toString().padStart(2,"0")}T`+
	`${date.getUTCHours().toString().padStart(2,"0")}`+
	`${date.getUTCMinutes().toString().padStart(2,"0")}`+
	`${date.getUTCSeconds().toString().padStart(2,"0")}Z`
}

function createEnexDocument():XMLDocument{
	const doctype = document.implementation.createDocumentType("en-export", "", "http://xml.evernote.com/pub/evernote-export4.dtd")
	const doc = document.implementation.createDocument(null, "en-export", doctype) as XMLDocument
	const root = (doc as XMLDocument).documentElement
	root.setAttribute("export-date", toTimeString(new Date()))
	root.setAttribute("application", "Evernote")
	root.setAttribute("version", "10.89.2")
	return doc;
}


function findAllMatches(text:string,reg:RegExp):Array<string>{
	const result:Array<string>=[]
	for(let match=reg.exec(text);match;match=reg.exec(text))
		result.push(match[0])
	return result 
}

function where(collection:any,func:(x:any)=>boolean):Array<any>{
	const result:Array<any>=[]
	for(let i=0;i<collection.length;i++)
		if(func(collection[i]))
			result.push(collection[i])
	return result
}

function onPctureLoaded(text:string):string{
	const dom=new DOMParser().parseFromString(text,"text/html")

	where(dom.getElementsByTagName("text"),()=>true).forEach(node=>{
        const ele = node as HTMLElement
		const newNode=dom.createElement("div")
		newNode.innerHTML=ele.innerHTML
        ele.parentNode?.replaceChild(newNode,ele)
    })
	where(dom.getElementsByTagName("new-format"),()=>true).forEach(node=>{
		const ele = node as HTMLElement
		ele.outerHTML=ele.innerHTML
	})

	where(dom.getElementsByTagName("delete"),()=>true).forEach(node=>{
		const ele = node as HTMLElement
		const newNode=dom.createElement("s")
		newNode.innerHTML=ele.innerHTML
        ele.parentNode?.replaceChild(newNode,ele)
	})

	where(dom.getElementsByTagName("input"),ele=>(ele as HTMLElement).getAttribute("type")=="checkbox").forEach(node=>{
		const ele=node as HTMLElement
		const checked=ele.getAttribute("checked")??"false"
		const newNode=dom.createElement("en-todo")
		newNode.setAttribute("checked",checked)
        const outerNode=dom.createElement("div")
        outerNode.appendChild(newNode)
		const next=ele.nextSibling
		if(next){
			next.parentNode?.removeChild(next)
			outerNode.appendChild(next)
		}
        ele.parentNode?.replaceChild(outerNode, ele);
	})

	where(dom.getElementsByTagName("size"),()=>true).forEach(node=>{//H1
		const ele=node as HTMLElement
		const newNode=dom.createElement("font")
		newNode.style.fontSize="18pt"
		newNode.innerHTML=ele.innerHTML
		ele.parentNode?.replaceChild(newNode,ele)
	})

	where(dom.getElementsByTagName("mid-size"),()=>true).forEach(node=>{//H2
		const ele=node as HTMLElement
		const newNode=dom.createElement("font")
		newNode.style.fontSize="16pt"
		newNode.innerHTML=ele.innerHTML
		ele.parentNode?.replaceChild(newNode,ele)
	})


	where(dom.getElementsByTagName("h3-size"),()=>true).forEach(node=>{//H3
		const ele=node as HTMLElement
		const newNode=dom.createElement("font")
		newNode.style.fontSize="14pt"
		newNode.innerHTML=ele.innerHTML
		ele.parentNode?.replaceChild(newNode,ele)
	})



	where(dom.getElementsByTagName("background"),()=>true).forEach(node=>{//荧光笔
		const ele=node as HTMLElement
		const color=ele.getAttribute("color")
		const newNode=dom.createElement("span")
		newNode.setAttribute("style",`background-color:${color} ;-evernote-highlight:true;`)
		newNode.innerHTML=ele.innerHTML
		ele.parentNode?.replaceChild(newNode,ele)	
	})

	return dom.body.innerHTML
}

const FolderList:Map<number,Folder>=new Map<number,Folder>()
FolderList.set(0,{subject:"未分类",notes:[]})
FolderList.set(2,{subject:"私密笔记",notes:[]})

async function handleFolderList(){
	for(const pair of FolderList)
	{
		//if(pair[1].subject!="未分类")continue;//可以修改这里以筛选要下载的笔记
		const folder=pair[1]
		const xmlDoc=createEnexDocument()
		const notePromiseList:Array<Promise<void>>=[]
		for(const noteId of folder.notes){
			notePromiseList.push(new Promise<void>((resolve2,reject2)=>{
				downloadNote(noteId).then(note=>{
					const resources:Map<string,string>=new Map<string,string>()
					const createDate=note.data.entry.createDate as number
					const modifyDate=note.data.entry.modifyDate as number
					let content=note.data.entry.content
					const pattern=/☺.+?<[^\/]+\/><[^\/]*\/>/g
					const matches=findAllMatches(note.data.entry.content,pattern)
					for(const img of matches){
						const fileId= img.substring(2,img.indexOf("<"))
						const imgUrl="https://i.mi.com/file/full?type=note_img&fileid="+fileId
						resources.set(imgUrl,img)
					}
					
					const title=(function(){
						const t=JSON.parse(note.data.entry.extraInfo).title
						return (!t)||t==""?"无标题笔记":t
					})()
	
					const theNote=xmlDoc.createElement("note")
					xmlDoc.documentElement.appendChild(theNote)
					
					const theTitle=xmlDoc.createElement("title")
					theTitle.appendChild(xmlDoc.createTextNode(title))
					theNote.appendChild(theTitle)
					
					const theContent=xmlDoc.createElement("content")
					theNote.appendChild(theContent)
					
					const theCreateDate=xmlDoc.createElement("created")
					theCreateDate.appendChild(xmlDoc.createTextNode(toTimeString(createDate)))
					theNote.appendChild(theCreateDate)
					
					const theUpdateDate=xmlDoc.createElement("updated")
					theUpdateDate.appendChild(xmlDoc.createTextNode(toTimeString(modifyDate)))
					theNote.appendChild(theUpdateDate)
					
					const theNoteAttr=xmlDoc.createElement("note-attributes")
					{
						let x=xmlDoc.createElement("author")
						theNoteAttr.appendChild(x)
						x=xmlDoc.createElement("source")
						theNoteAttr.appendChild(x)
						x=xmlDoc.createElement("source-application")
						theNoteAttr.appendChild(x)
					}
					theNote.appendChild(theNoteAttr)
					
					const downloadResourcePromiseList:Array<Promise<void>>=[]
					for(const [resourceUrl,placeholder] of resources){
						downloadResourcePromiseList.push(new Promise<void>((resolve1,reject1)=>{
							const theResource=xmlDoc.createElement("resource")
							downloadResource(resourceUrl).then(resData=>{
								const theData=xmlDoc.createElement("data")
								theData.setAttribute("encoding","base64")
								theData.appendChild(xmlDoc.createTextNode(resData.data))
								theResource.appendChild(theData)
								
								const theMime=xmlDoc.createElement("mime")
								theMime.appendChild(xmlDoc.createTextNode(resData.mime))
								theResource.appendChild(theMime)

								const [majorType,subType]=resData.mime.split("/")
								const objId=resData.hash
								if(resData instanceof(ImgData)){
									const theWidth=xmlDoc.createElement("width")
									theWidth.appendChild(xmlDoc.createTextNode(resData.width.toString()))
									theResource.appendChild(theWidth)
									
									const theHeight=xmlDoc.createElement("height")
									theHeight.appendChild(xmlDoc.createTextNode(resData.height.toString()))
									theResource.appendChild(theHeight)
								}
								content=content.replaceAll(placeholder,`<div><en-media type="${resData.mime}" hash="${objId}"/></div>`)
								
								const theResourceAttr=xmlDoc.createElement("resource-attributes")
								{
									let x=xmlDoc.createElement("source-url")
									x.appendChild(xmlDoc.createTextNode(""))
									theResourceAttr.appendChild(x)

									x=xmlDoc.createElement("file-name")
									x.appendChild(xmlDoc.createTextNode(`minote_${objId}.${subType}`))
									theResourceAttr.appendChild(x)
								}
								theResource.appendChild(theResourceAttr)

								theNote.appendChild(theResource)
								resolve1()
							}).catch(err=>reject1(err))
						}))
						
					}

					Promise.all(downloadResourcePromiseList).then(()=>{
						content=onPctureLoaded(content)
						theContent.innerHTML=`<![CDATA[<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE en-note SYSTEM "http://xml.evernote.com/pub/enml2.dtd"><en-note><div>${content}</div></en-note>]]>`
						xmlDoc.documentElement.appendChild(theNote)
						resolve2()
					}).catch(err=>reject2(err))
					
				}).catch(err=>reject2(err))
			}))
				
		}
		Promise.all(notePromiseList).then(()=>{
			const serializer = new XMLSerializer()
			const xmlString='<?xml version="1.0" encoding="UTF-8"?>'+serializer.serializeToString(xmlDoc)
			saveFile(xmlString,"text/plain",folder.subject+".enex")
		})
		
	}
}

function downloadNotesRecursive(syncTag:string|null,noteCollection:Array<any>) {
    const url="https://i.mi.com/note/full/page/?limit=200"+(syncTag?`&syncTag=${syncTag}`:"")
    fetch(url).then(res=>res.json()).then(json=>{
        for(const folder of json.data.folders)
            FolderList.set(folder.id,{subject:folder.subject,notes:[]})
		for(const entry of json.data.entries)
			noteCollection.push(entry)
        if(json.data.entries.length==0){
			for(const entry of noteCollection)
				FolderList.get(entry.folderId as number)!.notes.push(entry.id)
            handleFolderList()
			return
		}
        downloadNotesRecursive(json.data.syncTag,noteCollection)
    })
}


function saveFile(data:any,mime:string,filename:string){
    const blob = new Blob([data], { type: mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename;
    a.click()
    window.URL.revokeObjectURL(url)
}

function Md5Digest(data:ArrayBuffer):string{
	const buffer=new GSparkMD5.ArrayBuffer()
	buffer.append(data)
	return buffer.end()
}

function base64Encode(arrayBuffer:ArrayBuffer):string {
	const uint8Array = new Uint8Array(arrayBuffer);
	let binaryString = '';
	for (let i = 0; i < uint8Array.length; i++) {
		binaryString += String.fromCharCode(uint8Array[i]);
	}
	return btoa(binaryString);
}

function downloadResource(url:string):Promise<ImgData|SoundData>{
	return new Promise((resolve,reject)=>{
		fetch(url).then(res=>{
			const contentType=res.headers.get("Content-Type")
			res.arrayBuffer().then(rawData=>{
				if(contentType?.startsWith("image/")){
					const mime=contentType?contentType:"image/jpeg"
					const md5=Md5Digest(rawData)
					const blob = new Blob([rawData], { type: mime });
					const url = URL.createObjectURL(blob);
					const img = new Image();
					img.onload = function() {
						URL.revokeObjectURL(url);
						resolve({data:base64Encode(rawData),hash:md5,width:img.width,height:img.height,mime:mime})
					};
					img.onerror=err=>reject(err)
					img.src=url
				}else if(contentType?.startsWith("audio/")){
					reject("audio media not supported")
				}
				else
					reject()
				
			})
		}).catch(err=>reject(err))
	})
}

function downloadNote(noteId:string):Promise<any> {
    const url=`https://i.mi.com/note/note/${noteId}/`
	return new Promise((resolve,reject)=>{
		fetch(url).then(res=>res.json()).then(json=>{
			resolve(json)
		}).catch(err=>{
			reject(err)
		})
	})
}

function main(){
	GSparkMD5=(window as any).SparkMD5
	if(GSparkMD5)
		downloadNotesRecursive(null, []);
	else
		console.error("SparkMD5 not found")
}

if(!document.getElementById("md5Script")){
	const script = document.createElement('script');
	script.id="md5Script"
	script.onload=()=>{
		setTimeout(main, 1000); 
	}
	script.src = "https://cdnjs.cloudflare.com/ajax/libs/spark-md5/3.0.0/spark-md5.min.js";
	document.body.appendChild(script);
}else
	main()
