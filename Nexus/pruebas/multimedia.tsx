import React, {useState} from 'react';
import {View, Button, Image, Alert, Text, ActivityIndicator} from 'react-native';
import * as ImagePicker from "expo-image-picker";

// Funcion principal
export default function MultiMedia(){
    //Configurar variables de estado
    const [imagen, setImagen]=useState("");
    const [cargando, setCargando]=useState(false);
    //const [obtener, setObtener]=useState(true);\

    const seleccionarImagen = async()=>{
        const permisos=await ImagePicker.requestMediaLibraryPermissionsAsync();
        if(permisos.status!=="granted"){
            Alert.alert("Permisos denegados. Otorgue los permisos para continuar");
            return;
        } 
        
        const resultado=await ImagePicker.launchImageLibraryAsync({
            mediaTypes:ImagePicker.MediaTypeOptions.Images, 
            allowsEditing:true
        });
        if(!resultado.canceled){
            setImagen(resultado.assets[0].uri)
        }
    };
    const subirCloudinary = async ()=>{
        if(!imagen){
            Alert.alert("Error, primero debes seleccionar una imagen")
        };
        return;
    }
    setCargando(true);
    try{
        const datos=new FormData(){
        datos.append("file",{
            uri:imagen, 
            type:"/image.jpeg",
            name:"/image.jpg",
        }
        )
    } as any};
    datos.append("upload_preset", "aplicaciones")

    const respuesta = await fetch("https://api.cloudinary.com/v1_1/axcpwao6/image/upload"){
        method:"POST",
        body: datos,
    };

    const respuestaCloudinary=await respuesta.json();
    console.log("Respuesta obtenida: ", respuestaCloudinary);
    if(!respuestaCloudinary.secure_url){
        Alert.alert("Confirmado", "Imagen subida correctamente...");

    }else{
        Alert.alert("Error, no se pudo subir la imagen");
    }
    catch (error){
    Alert.alert("Error", "Ha ocurrido un error al subir la imagen")
    console.log("Error: ",error );

    }finally{
    setCargando(false);
    }

};

return(
    <View>
        <Text>Subir Imagen</Text>
        <Button
            title="Seleccionar imagen"
            onPress={seleccionarImagen}
        />
        {cargando?(
            <ActivityIndicator
                size="large"
            />
        ):(
            <Button
                title="Subir imagen"
                onPress
            />

        )
    }
    </View>
)